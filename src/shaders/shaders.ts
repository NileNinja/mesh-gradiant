/**
 * Stripe-Accurate Mesh Gradient Shaders — GLSL ES 3.00 (WebGL2)
 *
 * Key architecture insight (from Stripe's actual MiniGL source):
 *
 *   Color is sampled PER-PIXEL in the fragment shader from the interpolated
 *   world-space XZ position. This is the #1 reason Stripe looks smooth —
 *   there are ZERO per-vertex color seams because every pixel independently
 *   samples the noise field.
 *
 *   The color field uses a dual-wave approach:
 *     baseWave = sin(x*freq + t) * sin(z*freq + t*0.8)   ← slow, wide bands
 *     detailFbm = fbm(xz * detailFreq + t*0.5)            ← organic detail
 *     colorT = blend(baseWave, detailFbm)
 *
 *   Each color in the palette is added as a soft gaussian "orb" sitting on
 *   the color axis, not a hard step. This creates the characteristic blobs.
 */

// ── 3-octave FBM (reduced from 4 for performance) ────────────────────────────
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
// 3-octave FBM (3 = sweet spot for quality vs cost)
float fbm(vec2 p){
  float v=0.,a=.5;
  v+=a*snoise(p); p*=2.17; a*=.5;
  v+=a*snoise(p); p*=2.13; a*=.5;
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
`;

// ─────────────────────────────────────────────────────────────────────────────
//  1. GRADIENT VERTEX SHADER
//     Outputs world-space XZ position for per-pixel color sampling in frag.
//     Geometry only — no color computed here.
// ─────────────────────────────────────────────────────────────────────────────
export const GRADIENT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;  // flat XZ plane, Y=0
layout(location = 1) in vec2 uv;        // 0..1

uniform mat4  u_projView;
uniform vec3  u_position;
uniform vec3  u_scale;
uniform float u_rotX, u_rotY, u_rotZ;
uniform float u_time;
uniform float u_dFreqX, u_dFreqZ, u_dAmt;
uniform float u_txFreq, u_tyFreq, u_tzFreq;
uniform float u_txPow,  u_tyPow,  u_tzPow;

// World XZ (pre-displacement) → interpolated in frag for per-pixel color
out vec2  v_worldXZ;
out vec2  v_uv;
out float v_alpha;   // soft edge falloff

${NOISE_GLSL}

vec3 rotX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
vec3 rotZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}

void main(){
  vec3 pos = position;

  // ── Store original XZ for color sampling ───────────────────────────────
  // Normalized −1..1 range for noise coordinates
  v_worldXZ = pos.xz / 600.0; // 600 = half of 1200 mesh size

  // ── Noise displacement Y ────────────────────────────────────────────────
  float t = u_time * 0.00025;
  float noise = fbm(vec2(
    pos.x * u_dFreqX * u_scale.x + t,
    pos.z * u_dFreqZ * u_scale.z + t * 0.71
  ));
  pos.y += noise * u_dAmt * u_scale.y;

  // ── Twist X ──────────────────────────────────────────────────────────────
  float aX = pos.y * u_txFreq * u_txPow * 0.01;
  float cX=cos(aX), sX=sin(aX);
  pos = vec3(pos.x, pos.y*cX-pos.z*sX, pos.y*sX+pos.z*cX);

  // ── Twist Z ──────────────────────────────────────────────────────────────
  float aZ = pos.z * u_tzFreq * u_tzPow * 0.01;
  float cZ=cos(aZ), sZ=sin(aZ);
  pos = vec3(pos.x*cZ-pos.y*sZ, pos.x*sZ+pos.y*cZ, pos.z);

  // ── Twist Y ──────────────────────────────────────────────────────────────
  float aY = pos.x * u_tyFreq * u_tyPow * 0.01;
  float cY=cos(aY), sY=sin(aY);
  pos = vec3(pos.x*cY+pos.z*sY, pos.y, -pos.x*sY+pos.z*cY);

  // ── Model rotation + offset ──────────────────────────────────────────────
  pos = rotX(pos, u_rotX);
  pos = rotY(pos, u_rotY);
  pos = rotZ(pos, u_rotZ);
  pos += u_position;

  // ── Assign varyings ───────────────────────────────────────────────────────
  v_uv = uv;

  // ── Soft UV-edge alpha ───────────────────────────────────────────────────
  // Use input 'uv' (not v_uv which hasn't been written yet in some orderings)
  // How far from each edge (0 = at edge, 1 = far from edge)
  float edgeSoft = 0.04;
  float d0 = smoothstep(0.0, edgeSoft, uv.x);           // left edge
  float d1 = smoothstep(0.0, edgeSoft, 1.0 - uv.x);     // right edge
  float d2 = smoothstep(0.0, edgeSoft, uv.y);           // bottom edge
  float d3 = smoothstep(0.0, edgeSoft, 1.0 - uv.y);     // top edge
  v_alpha = min(min(d0, d1), min(d2, d3));

  gl_Position = u_projView * vec4(pos, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  2. GRADIENT FRAGMENT SHADER
//     Per-pixel color computed from interpolated world XZ position.
//     Uses Stripe's dual-wave approach:
//       Layer A: wide sine waves → slow colour bands
//       Layer B: FBM detail → organic texture
//     Each palette colour is a gaussian "orb" on the colour axis.
// ─────────────────────────────────────────────────────────────────────────────
export const GRADIENT_FRAG = `#version 300 es
precision highp float;

in vec2  v_worldXZ;
in vec2  v_uv;
in float v_alpha;

out vec4 fragColor;

uniform float u_time;
uniform float u_dFreqX, u_dFreqZ;
uniform vec3  u_color0,u_color1,u_color2,u_color3,u_color4,u_color5;
uniform int   u_colorCount;
uniform float u_colorContrast, u_colorSaturation, u_colorHueShift;
uniform vec3  u_bgColor;
uniform float u_dAmt; // repurposed as "wave amplitude" for color field

${NOISE_GLSL}
${HSL_GLSL}

// Gaussian orb: returns how strongly colour[i] appears at position t
float gaussOrb(float t, float center, float width){
  float d = (t - center) / max(width, 0.001);
  return exp(-d*d*2.0);
}

// Sample the colour palette: simple smooth interpolation between adjacent colors.
// This is what Stripe actually does — "t" (0..1) drives a 1D palette lookup.
vec3 paletteColor(float t){
  int n = u_colorCount;
  // Clamp t to [0,1]
  t = clamp(t, 0.0, 1.0);

  if(n <= 1) return u_color0;

  float fi   = t * float(n - 1);  // float index into palette
  int   idx  = int(fi);            // integer segment index
  float frac = fi - float(idx);    // fraction within segment

  // Smooth the interpolation (removes linear banding)
  frac = frac * frac * (3.0 - 2.0 * frac);  // smoothstep

  // Pick the two surrounding colors
  vec3 a = u_color0;
  vec3 b = u_color1;
  if(n > 2){ if(idx >= 1){ a = u_color1; b = u_color2; } }
  if(n > 3){ if(idx >= 2){ a = u_color2; b = u_color3; } }
  if(n > 4){ if(idx >= 3){ a = u_color3; b = u_color4; } }
  if(n > 5){ if(idx >= 4){ a = u_color4; b = u_color5; } }
  if(idx >= n - 1){ a = b; frac = 0.0; }  // clamp to last color

  return mix(a, b, frac);
}

// Secondary blend: add a soft highlight using a different noise axis.
// This creates the multi-layered "floating orb" Stripe look on top of the base bands.
vec3 stripeColor(float t, float t2){
  // Base: smooth palette sample
  vec3 base = paletteColor(t);

  // Highlight: sample palette at a slightly shifted position and add gently
  // This creates the illusion of a second overlapping color layer
  vec3 highlight = paletteColor(fract(t2 + 0.35));

  // Blend: mostly base with a soft highlight contribution
  return mix(base, highlight, 0.25);
}

void main(){
  vec2 xz = v_worldXZ;  // normalized: -1..1 across the 1200-unit mesh
  float t  = u_time * 0.00025;

  // ── Noise field for colour sampling ───────────────────────────────────────
  // Layer A: FBM gives organic variation (always in -1..1, remapped to 0..1)
  float noiseA = fbm(xz * 1.8 + vec2(t * 0.9, t * 0.65));
  noiseA = noiseA * 0.5 + 0.5;  // 0..1

  // Layer B: secondary FBM at different scale/speed
  float noiseB = fbm(xz * 1.1 + vec2(t * 0.55, t * 0.4));
  noiseB = noiseB * 0.5 + 0.5;  // 0..1

  // Layer C: sine wave for wide colour bands
  float sineA = sin(xz.x * 3.5 + noiseA * 2.0 + t * 1.1) * 0.5 + 0.5;

  // Blend: FBM provides organic detail, sine adds structured bands
  float colorT = mix(noiseA, sineA, 0.5);

  // ── Direct palette interpolation ──────────────────────────────────────────
  // colorT (0..1) selects from the user's color palette via smooth interpolation
  int n = u_colorCount;
  float fi   = clamp(colorT, 0.0, 1.0) * float(max(n - 1, 1));
  float frac = fract(fi);
  // smoothstep the fraction for silky interpolation
  frac = frac * frac * (3.0 - 2.0 * frac);

  // Build palette as an array of 6 slots
  vec3 palette[6];
  palette[0] = u_color0;
  palette[1] = (n > 1) ? u_color1 : u_color0;
  palette[2] = (n > 2) ? u_color2 : palette[1];
  palette[3] = (n > 3) ? u_color3 : palette[2];
  palette[4] = (n > 4) ? u_color4 : palette[3];
  palette[5] = (n > 5) ? u_color5 : palette[4];

  int i0 = int(fi);
  int i1 = min(i0 + 1, 5);

  vec3 baseCol = mix(palette[i0], palette[i1], frac);

  // ── Secondary highlight (creates depth/layering) ──────────────────────────
  float colorT2 = mix(noiseB, 1.0 - sineA, 0.4);
  float fi2 = clamp(colorT2, 0.0, 1.0) * float(max(n - 1, 1));
  float frac2 = fract(fi2); frac2 = frac2*frac2*(3.0-2.0*frac2);
  int i2 = int(fi2); int i3 = min(i2 + 1, 5);
  vec3 highlightCol = mix(palette[i2], palette[i3], frac2);

  // Blend: base + subtle highlight layer (creates the Stripe "orb" look)
  vec3 col = mix(baseCol, highlightCol, 0.22);

  // ── HSL adjustment ──────────────────────────────────────────────────────
  col = adjustHSL(col, u_colorHueShift, u_colorSaturation, u_colorContrast);

  // ── Background blend at mesh edges ──────────────────────────────────────
  col = mix(u_bgColor, col, v_alpha);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  3. FULLSCREEN QUAD VERTEX
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
//  4. BLOOM — brightness extract + separable Gaussian (runs at half-res)
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
    // 7-tap Gaussian (reduced from 9 for half-res bloom — still smooth)
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
//  5. COMPOSITE — scene + bloom + grain + vignette
// ─────────────────────────────────────────────────────────────────────────────
export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_scene, u_bloom;
uniform float u_glowAmount, u_blur, u_grain, u_vignette, u_time;
uniform vec2  u_resolution;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec3 col = texture(u_scene, v_uv).rgb;

  // Bloom add
  col += texture(u_bloom, v_uv).rgb * u_glowAmount;

  // Film grain
  if(u_grain > 0.01){
    float g = rand(v_uv + fract(u_time * .00091)) * 2. - 1.;
    col += g * u_grain * .025;
  }

  // Vignette
  if(u_vignette > 0.01){
    vec2 q = v_uv * 2. - 1.;
    col *= mix(1., clamp(1. - dot(q*.5, q*.5) * 1.5, 0., 1.), u_vignette);
  }

  fragColor = vec4(clamp(col, 0., 1.), 1.);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
//  6. WIREFRAME (creative mode)
// ─────────────────────────────────────────────────────────────────────────────
export const WIRE_FRAG = `#version 300 es
precision highp float;
in vec2  v_worldXZ;
in vec2  v_uv;
in float v_alpha;
out vec4 fragColor;
uniform float u_time;
uniform float u_dFreqX, u_dFreqZ, u_dAmt;
uniform vec3  u_color0, u_color1;
uniform float u_colorContrast, u_colorSaturation, u_colorHueShift;
${NOISE_GLSL}
${HSL_GLSL}
void main(){
  // Thin grid lines using fwidth
  vec2 fw = fwidth(v_uv);
  vec2 f  = abs(fract(v_uv * 48.) - .5);
  float wire = 1. - min(min(f.x/(fw.x*48.), f.y/(fw.y*48.)), 1.);
  wire = smoothstep(.35, .65, wire);

  float t = u_time * 0.00025;
  float wv = fbm(v_worldXZ * 1.8 + t) * .5 + .5;
  vec3 col = mix(u_color0, u_color1, wv);
  col = adjustHSL(col, u_colorHueShift, u_colorSaturation, u_colorContrast);
  fragColor = vec4(mix(col * .15, col * 2.0, wire) * v_alpha, 1.);
}
`;
