/**
 * MeshGradient Runtime — self-contained, dependency-free WebGL2 gradient engine.
 * Ships inside every exported component. ~6KB gzipped.
 *
 * API:
 *   const rt = new MeshGradientRuntime();
 *   rt.mount(canvas, config);
 *   rt.update({ speed: 0.5 });
 *   rt.pause(); rt.resume(); rt.dispose();
 */

export interface ColorStop { hex: string; alpha: number; }
export type RenderMode = 'waves' | 'blobs' | 'hybrid';
export type Material   = 'standard' | 'iridescent' | 'glass' | 'plasma' | 'silk';
export type MotionMode = 'flow' | 'drift' | 'swirl' | 'ripple' | 'pulse' | 'breathe' | 'aurora' | 'custom';

export interface MeshGradientConfig {
  colors:          ColorStop[];
  bgColor?:        string;
  renderMode?:     RenderMode;
  material?:       Material;
  motionMode?:     MotionMode;
  speed?:          number;
  seed?:           number;
  grain?:          number;
  glowAmount?:     number;
  motionIntensity?:number;
  iridescence?:    number;
  chromaticAberration?: number;
  refraction?:     number;
  // Advanced (optional)
  displaceFreqX?:  number;
  displaceFreqZ?:  number;
  displaceAmount?: number;
  twistFreqX?:     number; twistFreqY?: number; twistFreqZ?: number;
  twistPowX?:      number; twistPowY?:  number; twistPowZ?:  number;
  rotationX?:      number; rotationY?:  number; rotationZ?:  number;
  scaleX?:         number; scaleY?:     number; scaleZ?:     number;
  // Runtime options
  dprCap?:         number;  // default 1.5
  pauseWhenHidden?:boolean; // default true
}

const DEFAULTS: Required<MeshGradientConfig> = {
  colors:          [{ hex: '#0048e5', alpha: 1 }, { hex: '#e040fb', alpha: 1 }, { hex: '#00c8e8', alpha: 1 }],
  bgColor:         '#0a0a14',
  renderMode:      'waves',
  material:        'standard',
  motionMode:      'flow',
  speed:           1.0,
  seed:            0,
  grain:           0.8,
  glowAmount:      1.8,
  motionIntensity: 0.5,
  iridescence:     0,
  chromaticAberration: 0,
  refraction:      0,
  displaceFreqX:   0.0058, displaceFreqZ: 0.016, displaceAmount: -7.8,
  twistFreqX: -0.65, twistFreqY: 0.41, twistFreqZ: -0.58,
  twistPowX:  3.63,  twistPowY:  0.70, twistPowZ:  3.95,
  rotationX: -0.45, rotationY: -0.12, rotationZ: 1.87,
  scaleX: 7.2, scaleY: 8.0, scaleZ: 6.0,
  dprCap: 1.5,
  pauseWhenHidden: true,
};

// ── Inline GLSL (minified subset of the editor shaders) ───────────────────────

const NOISE = `
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
float fbm(vec2 p){float v=0.,a=.5;v+=a*snoise(p);p*=2.17;a*=.5;v+=a*snoise(p);p*=2.13;a*=.5;v+=a*snoise(p);return v;}
vec3 iriPalette(float t){return .5+.5*cos(6.28318*(t+vec3(0.,.33,.67)));}
`;

const HSL = `
vec3 rgb2hsl(vec3 c){
  float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b));
  float l=(mx+mn)*.5,d=mx-mn;
  float s=(d<.0001)?0.:d/(1.-abs(2.*l-1.));
  float h=0.;
  if(d>.0001){if(mx==c.r)h=mod((c.g-c.b)/d,6.)/6.;else if(mx==c.g)h=((c.b-c.r)/d+2.)/6.;else h=((c.r-c.g)/d+4.)/6.;}
  return vec3(h,s,l);
}
float _h2r(float p,float q,float t){if(t<0.)t+=1.;if(t>1.)t-=1.;if(t<.1667)return p+(q-p)*6.*t;if(t<.5)return q;if(t<.6667)return p+(q-p)*(.6667-t)*6.;return p;}
vec3 hsl2rgb(vec3 c){if(c.y<.0001)return vec3(c.z);float q=c.z<.5?c.z*(1.+c.y):c.z+c.y-c.z*c.y,p=2.*c.z-q;return vec3(_h2r(p,q,c.x+.3333),_h2r(p,q,c.x),_h2r(p,q,c.x-.3333));}
`;

const VERT = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv;
uniform mat4 u_pv;
uniform vec3 u_pos,u_scale;
uniform float u_rx,u_ry,u_rz,u_t,u_dFx,u_dFz,u_dA,u_txF,u_tyF,u_tzF,u_txP,u_tyP,u_tzP,u_seed,u_mi,u_speed;
uniform int u_mm;
out vec2 v_xz,v_uv; out float v_a,v_d;
${NOISE}
vec3 rotX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);}
vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
vec3 rotZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);}
void main(){
  vec3 pos=position;
  v_xz=pos.xz/600.;
  float t=u_t*0.00025,so=u_seed*7.3919;
  float n=fbm(vec2(pos.x*u_dFx*u_scale.x+t+so,pos.z*u_dFz*u_scale.z+t*.71+so));
  float dA=u_dA;
  if(u_mm==5) dA*=.6+.4*sin(u_t*.0004);
  if(u_mm==3) n+=sin(length(pos.xz)/600.*8.-u_t*.005)*.3*u_mi;
  if(u_mm==4){float pm=.75+.25*sin(u_t*.0006);pos.xz*=pm;}
  pos.y+=n*dA*u_scale.y; v_d=n;
  float aX=pos.y*u_txF*u_txP*.01,cX=cos(aX),sX=sin(aX); pos=vec3(pos.x,pos.y*cX-pos.z*sX,pos.y*sX+pos.z*cX);
  float aZ=pos.z*u_tzF*u_tzP*.01,cZ=cos(aZ),sZ=sin(aZ); pos=vec3(pos.x*cZ-pos.y*sZ,pos.x*sZ+pos.y*cZ,pos.z);
  float aY=pos.x*u_tyF*u_tyP*.01,cY=cos(aY),sY=sin(aY); pos=vec3(pos.x*cY+pos.z*sY,pos.y,-pos.x*sY+pos.z*cY);
  if(u_mm==6){float b=sin(v_xz.x*3.5+t*.8)*.15*u_mi; pos.y+=b*u_scale.y;}
  pos=rotX(pos,u_rx); pos=rotY(pos,u_ry); pos=rotZ(pos,u_rz); pos+=u_pos;
  v_uv=uv;
  float es=.04; v_a=min(min(smoothstep(0.,es,uv.x),smoothstep(0.,es,1.-uv.x)),min(smoothstep(0.,es,uv.y),smoothstep(0.,es,1.-uv.y)));
  gl_Position=u_pv*vec4(pos,1.);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_xz,v_uv; in float v_a,v_d;
out vec4 fc;
uniform float u_t,u_seed; uniform int u_mm,u_mat; uniform float u_mi,u_iri;
uniform vec4 u_colors[8]; uniform int u_cn;
uniform vec3 u_bg;
${NOISE}${HSL}
vec4 pal(float t){
  t=clamp(t,0.,1.); if(u_cn<=1)return u_colors[0];
  float fi=t*float(u_cn-1); int i0=int(fi),i1=min(i0+1,u_cn-1);
  float f=fi-float(i0); f=f*f*(3.-2.*f);
  return mix(u_colors[i0],u_colors[i1],f);
}
void main(){
  vec2 xz=v_xz; float t=u_t*.00025,so=u_seed*7.3919;
  float nA=fbm(xz*1.8+vec2(t*.9,t*.65)+so)*.5+.5;
  float nB=fbm(xz*1.1+vec2(t*.55,t*.4)+so)*.5+.5;
  float sA=sin(xz.x*3.5+nA*2.+t*1.1)*.5+.5;
  float aShift=0.; if(u_mm==6)aShift=(sin(xz.x*4.+t*.9)*.15+sin(xz.x*7.+t*1.4)*.07)*u_mi;
  float cT=mix(nA,sA,.5)+aShift, cT2=mix(nB,1.-sA,.4);
  vec4 pc=pal(cT),pc2=pal(cT2);
  vec3 col=mix(pc.rgb,pc2.rgb,.22); float palA=pc.a;
  // Iridescent
  if(u_mat==1||u_iri>.01){float fr=clamp(abs(v_d)*.5,0.,1.),str=(u_mat==1)?mix(.25,.6,u_iri):u_iri*.4; col=mix(col,iriPalette(fr+t*.05),fr*fr*str);}
  // Silk
  if(u_mat==4){float sk=pow(cos((xz.x*8.+xz.y*3.)*1.5+t*.5)*.5+.5,3.)*.35; col=mix(col,col*1.5+vec3(sk*.2),sk);}
  // Plasma
  if(u_mat==3){float pn=fbm(xz*3.5+vec2(t*1.8,t*1.3)+so)*.5+.5; col+=iriPalette(pn)*.4*pn*pn*.5;}
  // Adjust (simple contrast/sat — skipping full HSL for size)
  fc=vec4(clamp(mix(u_bg,col,v_a*palA),0.,1.),1.);
}`;

const BLOBS_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
out vec2 v_uv;
void main(){ v_uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;

const BLOBS_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv; out vec4 fc;
uniform float u_t,u_seed,u_mi; uniform int u_mm,u_mat;
uniform vec4 u_colors[8]; uniform int u_cn;
uniform vec3 u_bg; uniform float u_iri;
${NOISE}${HSL}
float smin(float a,float b,float k){float h=max(k-abs(a-b),0.)/k;return min(a,b)-h*h*h*k*(1./6.);}
vec4 pal(float t){
  t=clamp(t,0.,1.); if(u_cn<=1)return u_colors[0];
  float fi=t*float(u_cn-1); int i0=int(fi),i1=min(i0+1,u_cn-1);
  float f=fi-float(i0); f=f*f*(3.-2.*f);
  return mix(u_colors[i0],u_colors[i1],f);
}
vec2 blobCenter(float seed,float t){
  float a=t*(.3+seed*.4)+seed*6.2832;
  float rx=.3+seed*.25,ry=.2+fract(seed*1.618)*.2;
  return vec2(.5)+vec2(cos(a)*rx,sin(a)*ry);
}
void main(){
  vec2 uv=v_uv; float t=u_t*.00025,so=u_seed*7.3919;
  float bf=1000.; vec3 cAcc=vec3(0.); float wAcc=0.;
  for(int i=0;i<8;i++){
    if(i>=u_cn)break;
    float seed=float(i)/8.+so;
    vec2 center=blobCenter(seed,t);
    float r=.15+.08*snoise(vec2(seed*3.7,t*.4));
    float d=length(uv-center)-r;
    bf=smin(bf,d,.18);
    float w=1./max(d*d*25.,.0001);
    cAcc+=u_colors[i].rgb*u_colors[i].a*w; wAcc+=w;
  }
  float mask=1.-smoothstep(-.02,.08,bf);
  if(u_mm==3){float d=length(uv-vec2(.5));float rp=sin(d*12.-u_t*.007)*.5+.5;mask=mix(mask,mask*rp,.3*u_mi);}
  vec3 bc=(wAcc>0.)?cAcc/wAcc:u_bg;
  float det=fbm(uv*3.+vec2(t*.7,t*.5)+so)*.5+.5;
  bc=mix(bc,pal(det).rgb,.15);
  if(u_mat==1||u_iri>.01){float str=(u_mat==1)?mix(.25,.6,u_iri):u_iri*.4; bc=mix(bc,iriPalette(det+t*.05),mask*str);}
  fc=vec4(clamp(mix(u_bg,bc,mask),0.,1.),1.);
}`;

const BLOOM_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
out vec2 v_uv;
void main(){ v_uv=position*.5+.5; gl_Position=vec4(position,0.,1.); }`;

const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fc;
uniform sampler2D u_tex; uniform vec2 u_res; uniform float u_gp,u_gr; uniform int u_pass; uniform vec2 u_bd;
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  if(u_pass==0){vec3 c=texture(u_tex,v_uv).rgb;float b=smoothstep(u_gp,u_gp+u_gr*.4,luma(c));fc=vec4(c*b,1.);}
  else{vec2 px=u_bd/u_res;vec4 s=vec4(0.);s+=texture(u_tex,v_uv+px*-3.)*.0625;s+=texture(u_tex,v_uv+px*-2.)*.125;s+=texture(u_tex,v_uv+px*-1.)*.25;s+=texture(u_tex,v_uv)*.125;s+=texture(u_tex,v_uv+px)*.25;s+=texture(u_tex,v_uv+px*2.)*.125;s+=texture(u_tex,v_uv+px*3.)*.0625;fc=s;}
}`;

const COMP_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 fc;
uniform sampler2D u_scene,u_bloom; uniform float u_ga,u_grain,u_vig,u_t,u_ca; uniform vec2 u_res;
float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec3 col;
  if(u_ca>.001){vec2 d=(v_uv-.5)*u_ca*.012;col.r=texture(u_scene,v_uv+d).r;col.g=texture(u_scene,v_uv).g;col.b=texture(u_scene,v_uv-d).b;}
  else{col=texture(u_scene,v_uv).rgb;}
  col+=texture(u_bloom,v_uv).rgb*u_ga;
  if(u_grain>.01){float g=rand(v_uv+fract(u_t*.00091))*2.-1.;col+=g*u_grain*.025;}
  if(u_vig>.01){vec2 q=v_uv*2.-1.;col*=mix(1.,clamp(1.-dot(q*.5,q*.5)*1.5,0.,1.),u_vig);}
  fc=vec4(clamp(col,0.,1.),1.);
}`;

// ── Compile helpers ───────────────────────────────────────────────────────────

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? '');
  return s;
}

function link(gl: WebGL2RenderingContext, v: string, f: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, v));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, f));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? '');
  return p;
}

function hex2rgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c+c).join('') : s, 16);
  return [(n>>16&255)/255, (n>>8&255)/255, (n&255)/255];
}

function createFBO(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fbo, tex, w, h };
}

function buildMesh(N: number) {
  const size = 1200, half = size / 2, step = size / N;
  const vc = (N+1)*(N+1);
  const pos = new Float32Array(vc*3), uvs = new Float32Array(vc*2), idx = new Uint32Array(N*N*6);
  let vi=0, ui=0;
  for (let iz=0;iz<=N;iz++) for (let ix=0;ix<=N;ix++) {
    pos[vi++]=-half+ix*step; pos[vi++]=0; pos[vi++]=-half+iz*step;
    uvs[ui++]=ix/N; uvs[ui++]=1-iz/N;
  }
  let ii=0;
  for (let iz=0;iz<N;iz++) for (let ix=0;ix<N;ix++) {
    const a=iz*(N+1)+ix,b=a+1,c=a+(N+1),d=c+1;
    idx[ii++]=a;idx[ii++]=c;idx[ii++]=b;idx[ii++]=b;idx[ii++]=c;idx[ii++]=d;
  }
  return { pos, uvs, idx };
}

// Simple perspective + lookAt (no gl-matrix dep)
function perspective(fov: number, aspect: number): Float32Array {
  const f = 1/Math.tan(fov/2), nf = 1/(1-5000); const m = new Float32Array(16);
  m[0]=f/aspect; m[5]=f; m[10]=(5000+1)*nf; m[11]=-1; m[14]=2*5000*1*nf; return m;
}
function lookAt(): Float32Array {
  const dist=600, ey=dist*.55, ez=dist;
  let fx=0-0,fy=0-ey,fz=0-ez;
  const fl=Math.sqrt(fx*fx+fy*fy+fz*fz); fx/=fl;fy/=fl;fz/=fl;
  let sx=fy*0-fz*1,sy=fz*0-fx*0,sz=fx*1-fy*0;
  const sl=Math.sqrt(sx*sx+sy*sy+sz*sz); sx/=sl;sy/=sl;sz/=sl;
  const ux=sy*fz-sz*fy,uy=sz*fx-sx*fz,uz=sx*fy-sy*fx;
  const m = new Float32Array(16);
  m[0]=sx;m[1]=ux;m[2]=-fx;m[3]=0;m[4]=sy;m[5]=uy;m[6]=-fy;m[7]=0;
  m[8]=sz;m[9]=uz;m[10]=-fz;m[11]=0;
  m[12]=-(sx*0+sy*ey+sz*ez);m[13]=-(ux*0+uy*ey+uz*ez);m[14]=(fx*0+fy*ey+fz*ez);m[15]=1;
  return m;
}
function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let i=0;i<4;i++) for (let j=0;j<4;j++) {
    let s=0; for (let k=0;k<4;k++) s+=a[k*4+i]*b[j*4+k]; o[j*4+i]=s;
  }
  return o;
}

const MOTION_MODE_IDX: Record<MotionMode, number> = {
  flow:0,drift:1,swirl:2,ripple:3,pulse:4,breathe:5,aurora:6,custom:7,
};
const MATERIAL_IDX: Record<Material, number> = {
  standard:0,iridescent:1,glass:2,plasma:3,silk:4,
};

const _colorBuf = new Float32Array(32);

// ── Runtime class ─────────────────────────────────────────────────────────────

export class MeshGradientRuntime {
  private gl!: WebGL2RenderingContext;
  private cfg!: Required<MeshGradientConfig>;
  private progs!: { mesh: WebGLProgram; blobs: WebGLProgram; bloom: WebGLProgram; comp: WebGLProgram };
  private meshVao!: WebGLVertexArrayObject;
  private quadVao!: WebGLVertexArrayObject;
  private idxCount = 0;
  private sceneFBO!: ReturnType<typeof createFBO>;
  private bloomFBO0!: ReturnType<typeof createFBO>;
  private bloomFBO1!: ReturnType<typeof createFBO>;
  private time = 0;
  private last = 0;
  private raf = 0;
  private paused = false;
  private pv!: Float32Array;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private mq?: MediaQueryList;
  private mqHandler?: () => void;
  private canvas?: HTMLCanvasElement;

  mount(canvas: HTMLCanvasElement, config: MeshGradientConfig) {
    this.canvas = canvas;
    this.cfg = { ...DEFAULTS, ...config };

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'default' });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.progs = {
      mesh:  link(gl, VERT,        FRAG),
      blobs: link(gl, BLOBS_VERT,  BLOBS_FRAG),
      bloom: link(gl, BLOOM_VERT,  BLOOM_FRAG),
      comp:  link(gl, BLOOM_VERT,  COMP_FRAG),
    };

    this.buildMeshVao();
    this.buildQuadVao();
    this.resize();
    this.buildPV();

    // IntersectionObserver — pause when off-screen
    if (this.cfg.pauseWhenHidden && 'IntersectionObserver' in window) {
      this.io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) this.start(); else this.stop();
      }, { rootMargin: '200px' });
      this.io.observe(canvas);
    }

    // ResizeObserver — keep canvas pixel-correct
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement ?? canvas);
    }

    // prefers-reduced-motion
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.mqHandler = () => { this.paused = this.mq!.matches; };
    this.mq.addEventListener('change', this.mqHandler);
    if (this.mq.matches) this.paused = true;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.stop(); });
    canvas.addEventListener('webglcontextrestored', () => { this.mount(canvas, config); });

    this.start();
  }

  update(partial: Partial<MeshGradientConfig>) {
    Object.assign(this.cfg, partial);
  }

  pause()  { this.paused = true; }
  resume() { this.paused = false; }

  dispose() {
    this.stop();
    this.io?.disconnect();
    this.ro?.disconnect();
    if (this.mq && this.mqHandler) this.mq.removeEventListener('change', this.mqHandler);
  }

  private buildPV() {
    const fov = 45 * Math.PI / 180;
    const w = this.canvas?.width ?? 1200, h = this.canvas?.height ?? 675;
    this.pv = mul4(perspective(fov, w/h), lookAt());
  }

  private resize() {
    const canvas = this.canvas!;
    const parent = canvas.parentElement ?? canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, this.cfg.dprCap);
    const W = Math.round((parent.clientWidth  || 1200) * dpr);
    const H = Math.round((parent.clientHeight || 675)  * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    this.gl.viewport(0, 0, W, H);
    const bW = Math.max(1, W >> 1), bH = Math.max(1, H >> 1);
    this.sceneFBO  = createFBO(this.gl, W, H);
    this.bloomFBO0 = createFBO(this.gl, bW, bH);
    this.bloomFBO1 = createFBO(this.gl, bW, bH);
    this.buildPV();
  }

  private buildMeshVao() {
    const { gl } = this;
    const mesh = buildMesh(64);
    this.idxCount = mesh.idx.length;
    this.meshVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVao);
    const pb = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ub = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, ub); gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  private buildQuadVao() {
    const { gl } = this;
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!; gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private uploadColors(prog: WebGLProgram) {
    const { gl } = this;
    const stops = this.cfg.colors, n = Math.min(stops.length, 8);
    for (let i = 0; i < 8; i++) {
      const s = i < n ? stops[i] : stops[n-1];
      const [r,g,b] = hex2rgb(s.hex);
      _colorBuf[i*4]=r; _colorBuf[i*4+1]=g; _colorBuf[i*4+2]=b; _colorBuf[i*4+3]=s.alpha;
    }
    const loc = gl.getUniformLocation(prog, 'u_colors');
    if (loc) gl.uniform4fv(loc, _colorBuf);
    const cn = gl.getUniformLocation(prog, 'u_cn');
    if (cn) gl.uniform1i(cn, n);
  }

  private render() {
    const { gl, cfg } = this;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const bW = Math.max(1, W>>1), bH = Math.max(1, H>>1);
    const [bgR,bgG,bgB] = hex2rgb(cfg.bgColor);
    const mm = MOTION_MODE_IDX[cfg.motionMode];
    const mat = MATERIAL_IDX[cfg.material];
    const isBlobs = cfg.renderMode === 'blobs';

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(bgR, bgG, bgB, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (isBlobs) {
      const p = this.progs.blobs; gl.useProgram(p);
      this.uploadColors(p);
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform1f(u('u_t')!, this.time); gl.uniform1f(u('u_seed')!, cfg.seed);
      gl.uniform1f(u('u_mi')!, cfg.motionIntensity); gl.uniform1i(u('u_mm')!, mm);
      gl.uniform1i(u('u_mat')!, mat); gl.uniform1f(u('u_iri')!, cfg.iridescence);
      gl.uniform3f(u('u_bg')!, bgR, bgG, bgB);
      gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      const p = this.progs.mesh; gl.useProgram(p);
      this.uploadColors(p);
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniformMatrix4fv(u('u_pv')!, false, this.pv);
      gl.uniform3f(u('u_pos')!, 0, 0, 0);
      gl.uniform3f(u('u_scale')!, cfg.scaleX, cfg.scaleY, cfg.scaleZ);
      gl.uniform1f(u('u_rx')!, cfg.rotationX); gl.uniform1f(u('u_ry')!, cfg.rotationY); gl.uniform1f(u('u_rz')!, cfg.rotationZ);
      gl.uniform1f(u('u_t')!, this.time); gl.uniform1f(u('u_seed')!, cfg.seed);
      gl.uniform1f(u('u_dFx')!, cfg.displaceFreqX); gl.uniform1f(u('u_dFz')!, cfg.displaceFreqZ); gl.uniform1f(u('u_dA')!, cfg.displaceAmount);
      gl.uniform1f(u('u_txF')!, cfg.twistFreqX); gl.uniform1f(u('u_tyF')!, cfg.twistFreqY); gl.uniform1f(u('u_tzF')!, cfg.twistFreqZ);
      gl.uniform1f(u('u_txP')!, cfg.twistPowX); gl.uniform1f(u('u_tyP')!, cfg.twistPowY); gl.uniform1f(u('u_tzP')!, cfg.twistPowZ);
      gl.uniform1f(u('u_mi')!, cfg.motionIntensity); gl.uniform1i(u('u_mm')!, mm);
      gl.uniform1f(u('u_speed')!, cfg.speed); gl.uniform1i(u('u_mat')!, mat); gl.uniform1f(u('u_iri')!, cfg.iridescence);
      gl.uniform3f(u('u_bg')!, bgR, bgG, bgB);
      gl.enable(gl.DEPTH_TEST);
      gl.bindVertexArray(this.meshVao); gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.DEPTH_TEST);
    }

    // Bloom
    const bp = this.progs.bloom; gl.useProgram(bp);
    gl.bindVertexArray(this.quadVao);
    const bu = (n: string) => gl.getUniformLocation(bp, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO0.fbo); gl.viewport(0,0,bW,bH); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.tex);
    gl.uniform1i(bu('u_tex')!, 0); gl.uniform2f(bu('u_res')!, bW, bH);
    gl.uniform1f(bu('u_gp')!, 0.7); gl.uniform1f(bu('u_gr')!, 0.8); gl.uniform1i(bu('u_pass')!, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO1.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO0.tex);
    gl.uniform1i(bu('u_pass')!, 1); gl.uniform2f(bu('u_bd')!, 1, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO0.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO1.tex);
    gl.uniform2f(bu('u_bd')!, 0, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Composite
    const cp = this.progs.comp; gl.useProgram(cp);
    const cu = (n: string) => gl.getUniformLocation(cp, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0,0,W,H); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO0.tex);
    gl.uniform1i(cu('u_scene')!, 0); gl.uniform1i(cu('u_bloom')!, 1);
    gl.uniform1f(cu('u_ga')!, cfg.glowAmount); gl.uniform1f(cu('u_grain')!, cfg.grain);
    gl.uniform1f(cu('u_vig')!, 0); gl.uniform1f(cu('u_t')!, this.time); gl.uniform2f(cu('u_res')!, W, H);
    gl.uniform1f(cu('u_ca')!, cfg.material === 'glass' ? cfg.chromaticAberration : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private loop(ts: number) {
    const dt = Math.min(ts - this.last, 100);
    this.last = ts;
    if (!this.paused) { this.time += dt * this.cfg.speed; this.render(); }
    this.raf = requestAnimationFrame(t => this.loop(t));
  }

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.loop(t));
  }

  private stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }
}
