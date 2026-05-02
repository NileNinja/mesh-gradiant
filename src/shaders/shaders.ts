// ── 3-octave FBM (simplex noise) ─────────────────────────────────────────────
const NOISE_GLSL = `
vec3 _p3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 _p2(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 _perm(vec3 x){return _p3(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=_p2(i);
  vec3 p=_perm(_perm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m*m*m;
  vec3 xv=2.*fract(p*C.www)-1.;
  vec3 h=abs(xv)-.5; vec3 ox=floor(xv+.5); vec3 a0=xv-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
float fbm(vec2 p){
  float v=0.,a=.5;
  v+=a*snoise(p); p*=2.17; a*=.5;
  v+=a*snoise(p); p*=2.13; a*=.5;
  v+=a*snoise(p);
  return v;
}
// Higher-quality 5-octave FBM for plasma/detail passes
float fbmH(vec2 p){
  float v=0.,a=.5;
  v+=a*snoise(p); p*=2.17; a*=.5;
  v+=a*snoise(p); p*=2.13; a*=.5;
  v+=a*snoise(p); p*=2.09; a*=.5;
  v+=a*snoise(p); p*=2.05; a*=.5;
  v+=a*snoise(p);
  return v;
}
`;

// ── HSL utilities ─────────────────────────────────────────────────────────────
const HSL_GLSL = `
vec3 rgb2hsl(vec3 c){
  float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b));
  float l=(mx+mn)*.5,d=mx-mn;
  float s=(d<.0001)?0.:d/(1.-abs(2.*l-1.));
  float h=0.;
  if(d>.0001){
    if(mx==c.r)      h=mod((c.g-c.b)/d,6.)/6.;
    else if(mx==c.g) h=((c.b-c.r)/d+2.)/6.;
    else             h=((c.r-c.g)/d+4.)/6.;
  }
  return vec3(h,s,l);
}
float _h2r(float p,float q,float t){
  if(t<0.)t+=1.;if(t>1.)t-=1.;
  if(t<.1667)return p+(q-p)*6.*t;
  if(t<.5)return q;
  if(t<.6667)return p+(q-p)*(.6667-t)*6.;
  return p;
}
vec3 hsl2rgb(vec3 c){
  if(c.y<.0001)return vec3(c.z);
  float q=c.z<.5?c.z*(1.+c.y):c.z+c.y-c.z*c.y,p=2.*c.z-q;
  return vec3(_h2r(p,q,c.x+.3333),_h2r(p,q,c.x),_h2r(p,q,c.x-.3333));
}
vec3 adjustHSL(vec3 col,float hueShift,float satMult,float conMult){
  vec3 hsl=rgb2hsl(col);
  hsl.x=fract(hsl.x+hueShift);
  hsl.y=clamp(hsl.y*satMult,0.,1.);
  hsl.z=clamp((hsl.z-.5)*conMult+.5,0.,1.);
  return hsl2rgb(hsl);
}
// Iridescent palette — cycling hue from a 0..1 input
vec3 iriPalette(float t){
  return .5+.5*cos(6.28318*(t+vec3(0.,.33,.67)));
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  GRADIENT VERTEX — outputs world XZ for per-pixel color + motion features
// ─────────────────────────────────────────────────────────────────────────────
export const GRADIENT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec2 uv;

uniform mat4  u_projView;
uniform vec3  u_position;
uniform vec3  u_scale;
uniform float u_rotX, u_rotY, u_rotZ;
uniform float u_time;
uniform float u_dFreqX, u_dFreqZ, u_dAmt;
uniform float u_txFreq, u_tyFreq, u_tzFreq;
uniform float u_txPow,  u_tyPow,  u_tzPow;
uniform float u_seed;
uniform float u_motionIntensity;
// motion-mode features (ripple, pulse, breathe activations)
uniform int   u_motionMode;  // 0=flow 1=drift 2=swirl 3=ripple 4=pulse 5=breathe 6=aurora 7=custom

out vec2  v_worldXZ;
out vec2  v_uv;
out float v_alpha;
out float v_displace;  // displacement Y, passed to frag for material effects

${NOISE_GLSL}

vec3 rotX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
vec3 rotZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}

void main(){
  vec3 pos = position;
  v_worldXZ = pos.xz / 600.0;

  float t = u_time * 0.00025;
  float seedOff = u_seed * 7.3919;

  // ── Noise displacement ─────────────────────────────────────────────────────
  float noise = fbm(vec2(
    pos.x * u_dFreqX * u_scale.x + t + seedOff,
    pos.z * u_dFreqZ * u_scale.z + t * 0.71 + seedOff
  ));

  // motion-mode modulations
  float dAmt = u_dAmt;
  if (u_motionMode == 5) { // breathe: slow sin on displaceAmount
    dAmt *= 0.6 + 0.4 * sin(u_time * 0.0004);
  }
  if (u_motionMode == 3) { // ripple: radial pulse
    float r = length(pos.xz) / 600.0;
    noise += sin(r * 8.0 - u_time * 0.005) * 0.3 * u_motionIntensity;
  }
  if (u_motionMode == 4) { // pulse: scale modulation
    float pulseMod = 0.75 + 0.25 * sin(u_time * 0.0006);
    pos.xz *= pulseMod;
  }

  pos.y += noise * dAmt * u_scale.y;
  v_displace = noise;

  // ── Twist X ────────────────────────────────────────────────────────────────
  float aX = pos.y * u_txFreq * u_txPow * 0.01;
  float cX=cos(aX),sX=sin(aX);
  pos = vec3(pos.x, pos.y*cX-pos.z*sX, pos.y*sX+pos.z*cX);

  // ── Twist Z ────────────────────────────────────────────────────────────────
  float aZ = pos.z * u_tzFreq * u_tzPow * 0.01;
  float cZ=cos(aZ),sZ=sin(aZ);
  pos = vec3(pos.x*cZ-pos.y*sZ, pos.x*sZ+pos.y*cZ, pos.z);

  // ── Twist Y ────────────────────────────────────────────────────────────────
  float aY = pos.x * u_tyFreq * u_tyPow * 0.01;
  float cY=cos(aY),sY=sin(aY);
  pos = vec3(pos.x*cY+pos.z*sY, pos.y, -pos.x*sY+pos.z*cY);

  // aurora: add vertical-band sin overlay to twist
  if (u_motionMode == 6) {
    float band = sin(v_worldXZ.x * 3.5 + t * 0.8) * 0.15 * u_motionIntensity;
    pos.y += band * u_scale.y;
  }

  // ── Model rotation + offset ─────────────────────────────────────────────────
  pos = rotX(pos, u_rotX);
  pos = rotY(pos, u_rotY);
  pos = rotZ(pos, u_rotZ);
  pos += u_position;

  v_uv = uv;

  float edgeSoft = 0.04;
  v_alpha = min(
    min(smoothstep(0., edgeSoft, uv.x), smoothstep(0., edgeSoft, 1.-uv.x)),
    min(smoothstep(0., edgeSoft, uv.y), smoothstep(0., edgeSoft, 1.-uv.y))
  );

  gl_Position = u_projView * vec4(pos, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  GRADIENT FRAGMENT — 8-color palette + alpha + material effects
// ─────────────────────────────────────────────────────────────────────────────
export const GRADIENT_FRAG = `#version 300 es
precision highp float;

in vec2  v_worldXZ;
in vec2  v_uv;
in float v_alpha;
in float v_displace;

out vec4 fragColor;

uniform float u_time;
uniform float u_dFreqX, u_dFreqZ, u_dAmt;
uniform vec4  u_colors[8];       // rgba — alpha per stop
uniform int   u_colorCount;
uniform float u_colorContrast, u_colorSaturation, u_colorHueShift;
uniform vec3  u_bgColor;
uniform float u_seed;
uniform int   u_motionMode;
uniform float u_motionIntensity;

// material
uniform int   u_material;        // 0=standard 1=iridescent 2=glass 3=plasma 4=silk
uniform float u_iridescence;
uniform float u_chromaticAberration;
uniform float u_refraction;

// render mode
uniform int   u_renderMode;      // 0=waves 1=blobs 2=hybrid

// u_sceneTex: reserved for glass refraction in Phase 2

${NOISE_GLSL}
${HSL_GLSL}

// ── 8-slot palette with alpha interpolation ───────────────────────────────────
vec4 paletteColor(float t){
  t = clamp(t, 0.0, 1.0);
  int n = u_colorCount;
  if(n <= 1) return u_colors[0];
  float fi   = t * float(n - 1);
  int   i0   = int(fi);
  int   i1   = min(i0 + 1, n - 1);
  float frac = fi - float(i0);
  frac = frac * frac * (3.0 - 2.0 * frac);
  return mix(u_colors[i0], u_colors[i1], frac);
}

// ── Smooth-min for blob blending (Phase 2) ────────────────────────────────────
float smin(float a, float b, float k){
  float h = max(k - abs(a-b), 0.) / k;
  return min(a,b) - h*h*h*k*(1./6.);
}

void main(){
  vec2 xz = v_worldXZ;
  float t  = u_time * 0.00025;
  float seedOff = u_seed * 7.3919;

  // ── Base noise layers for color field ─────────────────────────────────────
  float noiseA = fbm(xz * 1.8 + vec2(t * 0.9,  t * 0.65) + seedOff);
  noiseA = noiseA * 0.5 + 0.5;

  float noiseB = fbm(xz * 1.1 + vec2(t * 0.55, t * 0.40) + seedOff);
  noiseB = noiseB * 0.5 + 0.5;

  float sineA = sin(xz.x * 3.5 + noiseA * 2.0 + t * 1.1) * 0.5 + 0.5;

  // aurora mode: vertical banding modulates color field
  float auroraShift = 0.0;
  if(u_motionMode == 6){
    auroraShift = sin(xz.x * 4.0 + t * 0.9) * 0.15 + sin(xz.x * 7.0 + t * 1.4) * 0.07;
    auroraShift *= u_motionIntensity;
  }

  float colorT  = mix(noiseA, sineA, 0.5) + auroraShift;
  float colorT2 = mix(noiseB, 1.0 - sineA, 0.4);

  // ── Plasma material: high-freq turbulence ─────────────────────────────────
  vec3 plasmaExtra = vec3(0.);
  float plasmaAlpha = 0.0;
  if(u_material == 3){
    float pn = fbmH(xz * 3.5 + vec2(t * 1.8, t * 1.3) + seedOff);
    pn = pn * 0.5 + 0.5;
    plasmaExtra = iriPalette(pn) * 0.4;
    plasmaAlpha = pn * pn;
    colorT = mix(colorT, pn, 0.35);
  }

  vec4 palColor  = paletteColor(colorT);
  vec4 palColor2 = paletteColor(colorT2);

  vec3 col  = palColor.rgb;
  float palA = palColor.a;

  // blend with highlight layer
  col = mix(col, palColor2.rgb, 0.22);

  // ── Material effects ───────────────────────────────────────────────────────

  // Iridescent: view-angle sheen from displacement gradient
  if(u_material == 1 || u_iridescence > 0.01){
    float fresnel = abs(v_displace);
    fresnel = clamp(fresnel * 0.5, 0.0, 1.0);
    vec3 sheen = iriPalette(fresnel + t * 0.05);
    float strength = (u_material == 1) ? mix(0.25, 0.6, u_iridescence) : u_iridescence * 0.4;
    col = mix(col, sheen, fresnel * fresnel * strength);
  }

  // Silk: anisotropic directional streak
  if(u_material == 4){
    float streak = cos((xz.x * 8.0 + xz.y * 3.0) * 1.5 + t * 0.5) * 0.5 + 0.5;
    streak = pow(streak, 3.0) * 0.35;
    col = mix(col, col * 1.5 + vec3(streak * 0.2), streak);
  }

  // Plasma: add turbulent tendrils
  if(u_material == 3){
    col += plasmaExtra * plasmaAlpha * 0.5;
  }

  // Silk & silk-lite: soft sheen
  if(u_material == 4){
    vec3 silkHsl = rgb2hsl(col);
    silkHsl.y = clamp(silkHsl.y * 0.8, 0., 1.);
    col = mix(col, hsl2rgb(silkHsl), 0.3);
  }

  // ── Color adjust ──────────────────────────────────────────────────────────
  col = adjustHSL(col, u_colorHueShift, u_colorSaturation, u_colorContrast);

  // ── Edge + alpha blend ────────────────────────────────────────────────────
  col = mix(u_bgColor, col, v_alpha * palA);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  BLOBS FRAGMENT — SDF metaball mesh-less gradient (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
export const BLOBS_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec4  u_colors[8];
uniform int   u_colorCount;
uniform float u_colorContrast, u_colorSaturation, u_colorHueShift;
uniform vec3  u_bgColor;
uniform float u_seed;
uniform int   u_motionMode;
uniform float u_motionIntensity;
uniform int   u_material;
uniform float u_iridescence;

${NOISE_GLSL}
${HSL_GLSL}

float smin(float a, float b, float k){
  float h = max(k - abs(a-b), 0.) / k;
  return min(a,b) - h*h*h*k*(1./6.);
}

vec4 paletteColor(float t){
  t = clamp(t, 0.0, 1.0);
  int n = u_colorCount;
  if(n <= 1) return u_colors[0];
  float fi = t * float(n - 1);
  int i0 = int(fi);
  int i1 = min(i0 + 1, n - 1);
  float frac = fi - float(i0);
  frac = frac * frac * (3.0 - 2.0 * frac);
  return mix(u_colors[i0], u_colors[i1], frac);
}

// Orbital blob center: elliptical orbit per seed
vec2 blobCenter(float seed, float t){
  float angle = t * (0.3 + seed * 0.4) + seed * 6.2832;
  float rx = 0.3 + seed * 0.25;
  float ry = 0.2 + fract(seed * 1.618) * 0.2;
  return vec2(0.5) + vec2(cos(angle)*rx, sin(angle)*ry);
}

void main(){
  vec2 uv = v_uv;
  float t  = u_time * 0.00025;
  float seedOff = u_seed * 7.3919;

  int n = u_colorCount;
  float blobField = 1000.;
  vec3 colorAcc   = vec3(0.);
  float weightAcc = 0.;

  for(int i = 0; i < 8; i++){
    if(i >= n) break;
    float seed = float(i) / 8.0 + seedOff;
    vec2 center = blobCenter(seed, t);

    // blob radius driven by noise for organic morphing
    float r = 0.15 + 0.08 * snoise(vec2(seed * 3.7, t * 0.4));

    float d = length(uv - center) - r;
    blobField = smin(blobField, d, 0.18);

    // color weight by inverse distance
    float w = 1.0 / max(d * d * 25.0, 0.0001);
    colorAcc   += u_colors[i].rgb * u_colors[i].a * w;
    weightAcc  += w;
  }

  float mask = 1.0 - smoothstep(-0.02, 0.08, blobField);

  // ── Ripple mode: radial pulse overlay ────────────────────────────────────
  if(u_motionMode == 3){
    vec2 center = vec2(0.5);
    float d = length(uv - center);
    float ripple = sin(d * 12.0 - u_time * 0.007) * 0.5 + 0.5;
    mask = mix(mask, mask * ripple, 0.3 * u_motionIntensity);
  }

  vec3 blobCol = (weightAcc > 0.) ? colorAcc / weightAcc : u_bgColor;

  // organic noise detail overlay
  float detail = fbm(uv * 3.0 + vec2(t * 0.7, t * 0.5) + seedOff) * 0.5 + 0.5;
  blobCol = mix(blobCol, paletteColor(detail).rgb, 0.15);

  // iridescent overlay
  if(u_material == 1 || u_iridescence > 0.01){
    float strength = (u_material == 1) ? mix(0.25, 0.6, u_iridescence) : u_iridescence * 0.4;
    vec3 sheen = iriPalette(detail + t * 0.05);
    blobCol = mix(blobCol, sheen, mask * strength);
  }

  blobCol = adjustHSL(blobCol, u_colorHueShift, u_colorSaturation, u_colorContrast);

  vec3 final = mix(u_bgColor, blobCol, mask);
  fragColor = vec4(clamp(final, 0., 1.), 1.);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  FULLSCREEN QUAD VERTEX
// ─────────────────────────────────────────────────────────────────────────────
export const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 position;
out vec2 v_uv;
void main(){
  v_uv = position * .5 + .5;
  gl_Position = vec4(position, 0., 1.);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  BLOOM — brightness extract + separable Gaussian
// ─────────────────────────────────────────────────────────────────────────────
export const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform float u_glowPower, u_glowRamp;
uniform int   u_pass;
uniform vec2  u_blurDir;
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
void main(){
  if(u_pass == 0){
    vec3 c = texture(u_tex, v_uv).rgb;
    float bright = smoothstep(u_glowPower, u_glowPower + u_glowRamp * .4, luma(c));
    fragColor = vec4(c * bright, 1.);
  } else {
    vec2 px = u_blurDir / u_resolution;
    vec4 s = vec4(0.);
    s += texture(u_tex, v_uv + px*-3.) * .0625;
    s += texture(u_tex, v_uv + px*-2.) * .1250;
    s += texture(u_tex, v_uv + px*-1.) * .2500;
    s += texture(u_tex, v_uv        )  * .1250;
    s += texture(u_tex, v_uv + px* 1.) * .2500;
    s += texture(u_tex, v_uv + px* 2.) * .1250;
    s += texture(u_tex, v_uv + px* 3.) * .0625;
    fragColor = s;
  }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  FXAA — fast approximate anti-aliasing pass
// ─────────────────────────────────────────────────────────────────────────────
export const FXAA_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform vec2 u_resolution;
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
void main(){
  vec2 px = 1.0 / u_resolution;
  vec3 c  = texture(u_tex, v_uv).rgb;
  vec3 cN = texture(u_tex, v_uv + vec2( 0., px.y)).rgb;
  vec3 cS = texture(u_tex, v_uv + vec2( 0.,-px.y)).rgb;
  vec3 cE = texture(u_tex, v_uv + vec2( px.x, 0.)).rgb;
  vec3 cW = texture(u_tex, v_uv + vec2(-px.x, 0.)).rgb;
  float lumaC  = dot(c,  vec3(.299,.587,.114));
  float lumaN  = dot(cN, vec3(.299,.587,.114));
  float lumaS  = dot(cS, vec3(.299,.587,.114));
  float lumaE  = dot(cE, vec3(.299,.587,.114));
  float lumaW  = dot(cW, vec3(.299,.587,.114));
  float lumaMin = min(lumaC, min(min(lumaN,lumaS),min(lumaE,lumaW)));
  float lumaMax = max(lumaC, max(max(lumaN,lumaS),max(lumaE,lumaW)));
  float range   = lumaMax - lumaMin;
  if(range < max(0.0312, lumaMax * 0.125)){
    fragColor = vec4(c, 1.); return;
  }
  vec2 dir = vec2(-(lumaN + lumaS - 2.*lumaC), lumaE + lumaW - 2.*lumaC);
  float dirReduce = max((lumaN+lumaS+lumaE+lumaW)*0.25*0.5, 1./128.);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.), vec2(8.)) * px;
  vec3 a = 0.5 * (texture(u_tex, v_uv + dir * -.5).rgb + texture(u_tex, v_uv + dir * .5).rgb);
  vec3 b = a * .5 + .25 * (texture(u_tex, v_uv + dir * -1.5).rgb + texture(u_tex, v_uv + dir * 1.5).rgb);
  float lumaB = dot(b, vec3(.299,.587,.114));
  fragColor = vec4((lumaB < lumaMin || lumaB > lumaMax) ? a : b, 1.);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSITE — scene + bloom + FXAA + grain + vignette
//  u_chromAb: chromatic aberration amount (glass material)
// ─────────────────────────────────────────────────────────────────────────────
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene, u_bloom;
uniform float u_glowAmount, u_blur, u_grain, u_vignette, u_time;
uniform float u_chromAb;
uniform vec2  u_resolution;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  // Chromatic aberration (glass material)
  vec3 col;
  if(u_chromAb > 0.001){
    vec2 dir = (v_uv - 0.5) * u_chromAb * 0.012;
    col.r = texture(u_scene, v_uv + dir       ).r;
    col.g = texture(u_scene, v_uv             ).g;
    col.b = texture(u_scene, v_uv - dir       ).b;
  } else {
    col = texture(u_scene, v_uv).rgb;
  }

  col += texture(u_bloom, v_uv).rgb * u_glowAmount;

  if(u_grain > 0.01){
    float g = rand(v_uv + fract(u_time * .00091)) * 2. - 1.;
    col += g * u_grain * .025;
  }

  if(u_vignette > 0.01){
    vec2 q = v_uv * 2. - 1.;
    col *= mix(1., clamp(1. - dot(q*.5, q*.5) * 1.5, 0., 1.), u_vignette);
  }

  fragColor = vec4(clamp(col, 0., 1.), 1.);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  WIREFRAME
// ─────────────────────────────────────────────────────────────────────────────
export const WIRE_FRAG = `#version 300 es
precision highp float;
in vec2  v_worldXZ;
in vec2  v_uv;
in float v_alpha;
in float v_displace;
out vec4 fragColor;
uniform float u_time;
uniform float u_dFreqX, u_dFreqZ, u_dAmt;
uniform vec4  u_colors[8];
uniform int   u_colorCount;
uniform float u_colorContrast, u_colorSaturation, u_colorHueShift;
${NOISE_GLSL}
${HSL_GLSL}
void main(){
  vec2 fw = fwidth(v_uv);
  vec2 f  = abs(fract(v_uv * 48.) - .5);
  float wire = 1. - min(min(f.x/(fw.x*48.), f.y/(fw.y*48.)), 1.);
  wire = smoothstep(.35, .65, wire);
  float t = u_time * 0.00025;
  float wv = fbm(v_worldXZ * 1.8 + t) * .5 + .5;
  vec3 c0 = u_colors[0].rgb;
  vec3 c1 = (u_colorCount > 1) ? u_colors[1].rgb : c0;
  vec3 col = mix(c0, c1, wv);
  col = adjustHSL(col, u_colorHueShift, u_colorSaturation, u_colorContrast);
  fragColor = vec4(mix(col * .15, col * 2.0, wire) * v_alpha, 1.);
}
`;
