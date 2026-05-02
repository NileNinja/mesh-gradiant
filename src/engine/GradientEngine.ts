import {
  GRADIENT_VERT, GRADIENT_FRAG, BLOBS_FRAG,
  QUAD_VERT, BLOOM_FRAG, FXAA_FRAG, COMPOSITE_FRAG, WIRE_FRAG,
} from '../shaders/shaders';
import type { GradientState } from '../state/GradientState';

// ── Helpers ───────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    gl.deleteShader(sh);
    throw new Error(`Shader compile:\n${log}\n\n${src.slice(0, 800)}`);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(`Program link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Parse '#rrggbb' or 'hsl(...)' to [0..1] RGB. */
function hex2rgb(color: string): [number, number, number] {
  if (color.startsWith('hsl')) {
    const m = color.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
    if (m) {
      const h = parseFloat(m[1]) / 360, s = parseFloat(m[2]) / 100, l = parseFloat(m[3]) / 100;
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      if (s === 0) return [l, l, l];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
    }
  }
  const h = color.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  if (isNaN(n)) return [0.5, 0.5, 0.5];
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// ── FBO ───────────────────────────────────────────────────────────────────────

interface FBO { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number; }

function createFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
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

function ensureFBO(gl: WebGL2RenderingContext, fbo: FBO | null, w: number, h: number): FBO {
  if (!fbo) return createFBO(gl, w, h);
  if (fbo.w === w && fbo.h === h) return fbo;
  fbo.w = w; fbo.h = h;
  gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return fbo;
}

// ── Mesh ─────────────────────────────────────────────────────────────────────

function buildMesh(size: number, N: number) {
  const step = size / N, half = size / 2;
  const vCount = (N + 1) * (N + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs       = new Float32Array(vCount * 2);
  const indices   = new Uint32Array(N * N * 6);
  let vi = 0, ui = 0;
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      positions[vi++] = -half + ix * step; positions[vi++] = 0; positions[vi++] = -half + iz * step;
      uvs[ui++] = ix / N; uvs[ui++] = 1 - iz / N;
    }
  }
  let ii = 0;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz*(N+1)+ix, b=a+1, c=a+(N+1), d=c+1;
      indices[ii++]=a; indices[ii++]=c; indices[ii++]=b;
      indices[ii++]=b; indices[ii++]=c; indices[ii++]=d;
    }
  }
  return { positions, uvs, indices, idxCount: indices.length };
}

// ── Matrix math ───────────────────────────────────────────────────────────────

type M4 = Float32Array;

function perspective(fovY: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0]=f/aspect; m[5]=f; m[10]=(far+near)*nf; m[11]=-1; m[14]=2*far*near*nf;
  return m;
}

function lookAt(eye: number[], center: number[], up: number[]): M4 {
  const [ex,ey,ez]=[eye[0],eye[1],eye[2]];
  let fx=center[0]-ex, fy=center[1]-ey, fz=center[2]-ez;
  let l=Math.sqrt(fx*fx+fy*fy+fz*fz); fx/=l; fy/=l; fz/=l;
  let sx=fy*up[2]-fz*up[1], sy=fz*up[0]-fx*up[2], sz=fx*up[1]-fy*up[0];
  l=Math.sqrt(sx*sx+sy*sy+sz*sz); sx/=l; sy/=l; sz/=l;
  const ux=sy*fz-sz*fy, uy=sz*fx-sx*fz, uz=sx*fy-sy*fx;
  const m = new Float32Array(16);
  m[0]=sx; m[1]=ux; m[2]=-fx; m[3]=0;
  m[4]=sy; m[5]=uy; m[6]=-fy; m[7]=0;
  m[8]=sz; m[9]=uz; m[10]=-fz; m[11]=0;
  m[12]=-(sx*ex+sy*ey+sz*ez); m[13]=-(ux*ex+uy*ey+uz*ez);
  m[14]=(fx*ex+fy*ey+fz*ez); m[15]=1;
  return m;
}

function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let i=0;i<4;i++) for (let j=0;j<4;j++) {
    let s=0; for (let k=0;k<4;k++) s+=a[k*4+i]*b[j*4+k]; o[j*4+i]=s;
  }
  return o;
}

// ── Engine ────────────────────────────────────────────────────────────────────

type UMap = Record<string, WebGLUniformLocation | null>;

interface Programs {
  gradient:  WebGLProgram;
  blobs:     WebGLProgram;
  wire:      WebGLProgram;
  bloom:     WebGLProgram;
  fxaa:      WebGLProgram;
  composite: WebGLProgram;
}

// Reusable Float32Array for 8-color palette upload (32 floats)
const _colorBuf = new Float32Array(32);

export class GradientEngine {
  private gl: WebGL2RenderingContext;
  private progs!: Programs;
  private meshVao!: WebGLVertexArrayObject;
  private quadVao!: WebGLVertexArrayObject;
  private idxCount = 0;

  // FBOs
  private sceneFBO!: FBO;
  private fxaaFBO!:  FBO;
  private bloomFBO0!: FBO;
  private bloomFBO1!: FBO;

  // Uniform maps
  private gU: UMap = {};   // gradient
  private bU: UMap = {};   // blobs
  private wU: UMap = {};   // wire
  private blU: UMap = {};  // bloom
  private fU: UMap = {};   // fxaa
  private cU: UMap = {};   // composite

  state: GradientState;
  private time  = 0;
  private last  = 0;
  private raf   = 0;
  private dirty = true;

  lastFrameTime = 0;

  // Adaptive quality EMA — auto-tiers meshDetail and DPR based on frame time
  private frameEma = 16.7;  // starts at 60fps equivalent
  private qualCooldown = 0; // frames before next quality change
  private hiddenByIO = false;

  private pvMatrix!: M4;
  private pvDirty  = true;

  onFrame?: (fps: number, gpu: string) => void;

  constructor(canvas: HTMLCanvasElement, state: GradientState) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'default',
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.state = state;
    this.build();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
    }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      this.build();
      this.start();
    }, false);
  }

  private build() {
    const { gl } = this;
    this.progs = {
      gradient:  linkProgram(gl, GRADIENT_VERT, GRADIENT_FRAG),
      blobs:     linkProgram(gl, QUAD_VERT,     BLOBS_FRAG),
      wire:      linkProgram(gl, GRADIENT_VERT, WIRE_FRAG),
      bloom:     linkProgram(gl, QUAD_VERT,     BLOOM_FRAG),
      fxaa:      linkProgram(gl, QUAD_VERT,     FXAA_FRAG),
      composite: linkProgram(gl, QUAD_VERT,     COMPOSITE_FRAG),
    };
    this.cacheUniforms();
    this.buildQuadVao();
    this.buildMeshVao();
    this.resize();
  }

  private cacheUniforms() {
    const { gl } = this;

    // Shared gradient/wire uniforms
    const meshNames = [
      'u_projView','u_position','u_scale','u_rotX','u_rotY','u_rotZ',
      'u_time','u_dFreqX','u_dFreqZ','u_dAmt',
      'u_txFreq','u_tyFreq','u_tzFreq','u_txPow','u_tyPow','u_tzPow',
      'u_seed','u_motionMode','u_motionIntensity',
    ];
    const colorNames = [
      'u_colors','u_colorCount','u_colorContrast','u_colorSaturation','u_colorHueShift','u_bgColor',
    ];
    const matNames = ['u_material','u_iridescence','u_chromaticAberration','u_refraction','u_renderMode'];

    gl.useProgram(this.progs.gradient);
    for (const n of [...meshNames, ...colorNames, ...matNames])
      this.gU[n] = gl.getUniformLocation(this.progs.gradient, n);

    gl.useProgram(this.progs.wire);
    for (const n of [...meshNames, ...colorNames])
      this.wU[n] = gl.getUniformLocation(this.progs.wire, n);

    // Blobs program (uses QUAD_VERT — no mesh uniforms)
    gl.useProgram(this.progs.blobs);
    for (const n of ['u_time','u_seed','u_motionMode','u_motionIntensity',
                     ...colorNames, 'u_material','u_iridescence','u_renderMode'])
      this.bU[n] = gl.getUniformLocation(this.progs.blobs, n);

    const bloomNames = ['u_tex','u_resolution','u_glowPower','u_glowRamp','u_pass','u_blurDir'];
    gl.useProgram(this.progs.bloom);
    for (const n of bloomNames) this.blU[n] = gl.getUniformLocation(this.progs.bloom, n);

    gl.useProgram(this.progs.fxaa);
    for (const n of ['u_tex','u_resolution'])
      this.fU[n] = gl.getUniformLocation(this.progs.fxaa, n);

    const compNames = ['u_scene','u_bloom','u_glowAmount','u_blur','u_grain','u_vignette','u_time','u_resolution','u_chromAb'];
    gl.useProgram(this.progs.composite);
    for (const n of compNames) this.cU[n] = gl.getUniformLocation(this.progs.composite, n);
  }

  private buildQuadVao() {
    const { gl } = this;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private buildMeshVao() {
    const { gl } = this;
    const mesh = buildMesh(1200, this.state.meshDetail);
    this.idxCount = mesh.idxCount;
    if (this.meshVao) gl.deleteVertexArray(this.meshVao);
    this.meshVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVao);

    const pb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const ub = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  resize() {
    const { gl } = this;
    const canvas = gl.canvas as HTMLCanvasElement;
    const dpr = Math.min(window.devicePixelRatio || 1, this.state.dpr);
    const W = Math.round(this.state.canvasWidth  * dpr);
    const H = Math.round(this.state.canvasHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
    }
    canvas.style.width  = `${this.state.canvasWidth}px`;
    canvas.style.height = `${this.state.canvasHeight}px`;
    gl.viewport(0, 0, W, H);

    const bW = Math.max(1, W >> 1), bH = Math.max(1, H >> 1);
    this.sceneFBO  = ensureFBO(gl, this.sceneFBO,  W,  H);
    this.fxaaFBO   = ensureFBO(gl, this.fxaaFBO,   W,  H);
    this.bloomFBO0 = ensureFBO(gl, this.bloomFBO0, bW, bH);
    this.bloomFBO1 = ensureFBO(gl, this.bloomFBO1, bW, bH);
    this.pvDirty = true;
    this.markDirty();
  }

  private buildProjView(): M4 {
    const s = this.state;
    const aspect = s.canvasWidth / s.canvasHeight;
    const fovRad = (s.cameraFov * Math.PI) / 180;
    const proj = perspective(fovRad, aspect, 1, 5000);
    const dist = s.cameraDist;
    const view = lookAt([0, dist * 0.55, dist], [0, 0, 0], [0, 1, 0]);
    return mul(proj, view);
  }

  // Upload color palette as flat vec4[8] array (rgba)
  private uploadColors(U: UMap) {
    const { gl } = this;
    const stops = this.state.colors;
    const count  = Math.min(stops.length, 8);
    for (let i = 0; i < 8; i++) {
      const stop = i < count ? stops[i] : stops[count - 1];
      const [r, g, b] = hex2rgb(stop.hex);
      _colorBuf[i*4  ] = r;
      _colorBuf[i*4+1] = g;
      _colorBuf[i*4+2] = b;
      _colorBuf[i*4+3] = stop.alpha;
    }
    const loc = U['u_colors'];
    if (loc) gl.uniform4fv(loc, _colorBuf);
    const ci = U['u_colorCount'];
    if (ci) gl.uniform1i(ci, count);
  }

  private setMeshUniforms(U: UMap) {
    const { gl } = this;
    const s = this.state;
    const f  = (n: string, v: number) => { const u=U[n]; if(u)gl.uniform1f(u,v); };
    const fi = (n: string, v: number) => { const u=U[n]; if(u)gl.uniform1i(u,v); };
    const v3 = (n: string, r: number, g: number, b: number) => { const u=U[n]; if(u)gl.uniform3f(u,r,g,b); };

    if (this.pvDirty) { this.pvMatrix = this.buildProjView(); this.pvDirty = false; }
    const pv = U['u_projView'];
    if (pv) gl.uniformMatrix4fv(pv, false, this.pvMatrix);

    v3('u_position', s.positionX, s.positionY, s.positionZ);
    v3('u_scale',    s.scaleX, s.scaleY, s.scaleZ);
    f('u_rotX', s.rotationX); f('u_rotY', s.rotationY); f('u_rotZ', s.rotationZ);
    f('u_time', this.time);
    f('u_dFreqX', s.displaceFreqX); f('u_dFreqZ', s.displaceFreqZ); f('u_dAmt', s.displaceAmount);
    f('u_txFreq', s.twistFreqX); f('u_tyFreq', s.twistFreqY); f('u_tzFreq', s.twistFreqZ);
    f('u_txPow',  s.twistPowX);  f('u_tyPow',  s.twistPowY);  f('u_tzPow',  s.twistPowZ);
    f('u_seed', s.seed);
    f('u_motionIntensity', s.motionIntensity);
    fi('u_motionMode', ['flow','drift','swirl','ripple','pulse','breathe','aurora','custom'].indexOf(s.motionMode));

    this.uploadColors(U);
    f('u_colorContrast',   s.colorContrast);
    f('u_colorSaturation', s.colorSaturation);
    f('u_colorHueShift',   s.colorHueShift);
    const [bgR, bgG, bgB] = hex2rgb(s.bgColor);
    v3('u_bgColor', bgR, bgG, bgB);
  }

  private setMaterialUniforms(U: UMap) {
    const { gl } = this;
    const s = this.state;
    const matIdx = ['standard','iridescent','glass','plasma','silk'].indexOf(s.material);
    const mu = U['u_material']; if (mu) gl.uniform1i(mu, matIdx);
    const iu = U['u_iridescence']; if (iu) gl.uniform1f(iu, s.iridescence);
    const cu = U['u_chromaticAberration']; if (cu) gl.uniform1f(cu, s.chromaticAberration);
    const ru = U['u_refraction']; if (ru) gl.uniform1f(ru, s.refraction);
    const rm = U['u_renderMode']; if (rm) gl.uniform1i(rm, ['waves','blobs','hybrid'].indexOf(s.renderMode));
  }

  private renderFrame() {
    const { gl } = this;
    const canvas = gl.canvas as HTMLCanvasElement;
    const W = canvas.width, H = canvas.height;
    const bW = Math.max(1, W >> 1), bH = Math.max(1, H >> 1);
    const s = this.state;
    const [bgR, bgG, bgB] = hex2rgb(s.bgColor);

    // ── Pass 0: Mesh / blobs → sceneFBO ──────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(bgR, bgG, bgB, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (s.renderMode === 'blobs') {
      // Full-screen blob pass
      gl.useProgram(this.progs.blobs);
      this.uploadColors(this.bU);
      const { gl: g } = this;
      const bU = this.bU;
      const fi2 = (n: string, v: number) => { const u=bU[n]; if(u)g.uniform1i(u,v); };
      const f2  = (n: string, v: number) => { const u=bU[n]; if(u)g.uniform1f(u,v); };
      const v3b = (n: string, r: number, a: number, b: number) => { const u=bU[n]; if(u)g.uniform3f(u,r,a,b); };
      f2('u_time', this.time);
      f2('u_seed', s.seed);
      f2('u_motionIntensity', s.motionIntensity);
      fi2('u_motionMode', ['flow','drift','swirl','ripple','pulse','breathe','aurora','custom'].indexOf(s.motionMode));
      fi2('u_material', ['standard','iridescent','glass','plasma','silk'].indexOf(s.material));
      f2('u_iridescence', s.iridescence);
      fi2('u_renderMode', 0);
      f2('u_colorContrast', s.colorContrast);
      f2('u_colorSaturation', s.colorSaturation);
      f2('u_colorHueShift', s.colorHueShift);
      const [r,g2,b2] = hex2rgb(s.bgColor);
      v3b('u_bgColor', r, g2, b2);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    } else {
      // Wave mesh pass (or hybrid: waves first, blobs composite in Phase 2)
      gl.enable(gl.DEPTH_TEST);
      const isWire = s.wireframe;
      const prog = isWire ? this.progs.wire : this.progs.gradient;
      const U    = isWire ? this.wU : this.gU;
      gl.useProgram(prog);
      this.setMeshUniforms(U);
      if (!isWire) this.setMaterialUniforms(U);
      gl.bindVertexArray(this.meshVao);
      gl.drawElements(isWire ? gl.LINES : gl.TRIANGLES, this.idxCount, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.disable(gl.DEPTH_TEST);
    }

    // ── Pass 1: FXAA → fxaaFBO ───────────────────────────────────────────────
    gl.useProgram(this.progs.fxaa);
    gl.bindVertexArray(this.quadVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fxaaFBO.fbo);
    gl.viewport(0, 0, W, H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.tex);
    const fU = this.fU;
    if (fU['u_tex'])        gl.uniform1i(fU['u_tex']!, 0);
    if (fU['u_resolution']) gl.uniform2f(fU['u_resolution']!, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 2: Bloom extract → bloomFBO0 (half-res) ─────────────────────────
    gl.useProgram(this.progs.bloom);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO0.fbo);
    gl.viewport(0, 0, bW, bH);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fxaaFBO.tex);
    const blU = this.blU;
    if (blU['u_tex'])       gl.uniform1i(blU['u_tex']!, 0);
    if (blU['u_resolution'])gl.uniform2f(blU['u_resolution']!, bW, bH);
    if (blU['u_glowPower']) gl.uniform1f(blU['u_glowPower']!, s.glowPower);
    if (blU['u_glowRamp'])  gl.uniform1f(blU['u_glowRamp']!, s.glowRamp);
    if (blU['u_pass'])      gl.uniform1i(blU['u_pass']!, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 3: H-blur ────────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO1.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO0.tex);
    if (blU['u_pass'])    gl.uniform1i(blU['u_pass']!, 1);
    if (blU['u_blurDir']) gl.uniform2f(blU['u_blurDir']!, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 4: V-blur ────────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFBO0.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO1.tex);
    if (blU['u_blurDir']) gl.uniform2f(blU['u_blurDir']!, 0, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 5: Composite → canvas ────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progs.composite);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fxaaFBO.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bloomFBO0.tex);
    const cU = this.cU;
    if (cU['u_scene'])      gl.uniform1i(cU['u_scene']!, 0);
    if (cU['u_bloom'])      gl.uniform1i(cU['u_bloom']!, 1);
    if (cU['u_glowAmount']) gl.uniform1f(cU['u_glowAmount']!, s.glowAmount);
    if (cU['u_blur'])       gl.uniform1f(cU['u_blur']!, s.blur);
    if (cU['u_grain'])      gl.uniform1f(cU['u_grain']!, s.grain);
    if (cU['u_vignette'])   gl.uniform1f(cU['u_vignette']!, s.vignette);
    if (cU['u_time'])       gl.uniform1f(cU['u_time']!, this.time);
    if (cU['u_resolution']) gl.uniform2f(cU['u_resolution']!, W, H);
    if (cU['u_chromAb'])    gl.uniform1f(cU['u_chromAb']!, s.material === 'glass' ? s.chromaticAberration : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private loop(ts: number) {
    const targetMs = 1000 / this.state.targetFps;
    const dt = ts - this.last;

    if (dt >= targetMs - 1) {
      const actualDt = Math.min(dt, 100);
      this.last = ts;

      if (!this.state.paused && !this.hiddenByIO) {
        this.time += actualDt * this.state.speed;
        this.dirty = true;
      }

      if (this.dirty && !this.hiddenByIO) {
        const t0 = performance.now();
        this.renderFrame();
        const renderMs = performance.now() - t0;
        this.dirty = false;
        this.lastFrameTime = ts;

        // Adaptive quality: EMA of render time (α=0.1)
        this.frameEma = this.frameEma * 0.9 + renderMs * 0.1;
        if (this.qualCooldown > 0) this.qualCooldown--;
        else this.adaptQuality();

        this.onFrame?.(1000 / actualDt, `${this.state.targetFps}fps cap`);
      }
    }

    this.raf = requestAnimationFrame(ts => this.loop(ts));
  }

  private adaptQuality() {
    const s = this.state;
    const TIERS = [32, 48, 64, 80, 96, 112, 128];
    const idx = TIERS.indexOf(Math.max(32, Math.min(128, s.meshDetail)));

    if (this.frameEma > 28 && idx > 0) {
      // Drop one tier — frame time too high
      s.meshDetail = TIERS[idx - 1];
      this.buildMeshVao();
      this.qualCooldown = 120; // wait 2s at 60fps before next change
    } else if (this.frameEma < 14 && idx < TIERS.length - 1) {
      // Tier up — plenty of headroom
      s.meshDetail = TIERS[idx + 1];
      this.buildMeshVao();
      this.qualCooldown = 300;
    }
  }

  /** Wire IntersectionObserver so the loop pauses when the canvas is off-screen. */
  watchVisibility(canvas: HTMLCanvasElement) {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => {
      this.hiddenByIO = !entry.isIntersecting;
      if (!this.hiddenByIO) this.markDirty();
    }, { rootMargin: '100px' });
    io.observe(canvas);
  }

  markDirty() { this.dirty = true; this.pvDirty = true; this.lastFrameTime = performance.now(); }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(ts => this.loop(ts));
  }

  stop() {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  applyState(s: GradientState) {
    const rebuildMesh = s.meshDetail !== this.state.meshDetail;
    const resize = s.canvasWidth !== this.state.canvasWidth
                || s.canvasHeight !== this.state.canvasHeight
                || s.dpr !== this.state.dpr;
    this.state = { ...s, colors: s.colors.map(c => ({ ...c })) };
    if (rebuildMesh) this.buildMeshVao();
    if (resize) this.resize();
    this.pvDirty = true;
    this.markDirty();
  }

  async snapshot(): Promise<Blob> {
    this.renderFrame();
    return new Promise(resolve =>
      (this.gl.canvas as HTMLCanvasElement).toBlob(b => resolve(b!), 'image/png')
    );
  }

  destroy() {
    this.stop();
    Object.values(this.progs).forEach(p => this.gl.deleteProgram(p));
  }
}
