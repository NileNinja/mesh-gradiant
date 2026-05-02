import type { GradientState, RenderMode, Material, MotionMode } from '../state/GradientState';
import type { GradientEngine } from '../engine/GradientEngine';
import { ColorList } from './ColorList';
import { MOTION_MODES, MOTION_MODE_LABELS } from '../state/motionModes';
import { patch } from '../state/observers';

export class ControlPanel {
  private root: HTMLElement;
  private engine: GradientEngine;
  private onChange: () => void;

  constructor(container: HTMLElement, engine: GradientEngine, onChange: () => void) {
    this.engine   = engine;
    this.onChange = onChange;
    this.root = document.createElement('div');
    this.root.className = 'ctrl-panel';
    container.appendChild(this.root);
    this.render();
  }

  private get s(): GradientState { return this.engine.state; }

  render() {
    this.root.textContent = '';
    const body = this.root;
    const s = this.s;
    const ch = () => { this.engine.markDirty(); this.onChange(); };

    // ── ① Canvas Size ──────────────────────────────────────────────────────
    const canvasSec = section(body, '📐 Canvas Size');
    const sizeRow = row(canvasSec);
    numInput(sizeRow, 'W', s.canvasWidth,  200, 7680, 10, v => { s.canvasWidth  = v; this.engine.resize(); ch(); });
    numInput(sizeRow, 'H', s.canvasHeight, 200, 4320, 10, v => { s.canvasHeight = v; this.engine.resize(); ch(); });

    const aspectRow = el('div', 'ctrl-aspect-row');
    const aspects: [string, number, number][] = [
      ['16:9',1920,1080],['4:3',1440,1080],['1:1',1080,1080],['3:2',1620,1080],['21:9',2520,1080],
    ];
    for (const [lbl, w, h] of aspects) {
      const btn = el('button', 'ctrl-tag-btn');
      btn.textContent = lbl;
      btn.onclick = () => {
        const sc = 1200 / w;
        s.canvasWidth  = Math.round(w * sc);
        s.canvasHeight = Math.round(h * sc);
        this.engine.resize(); this.render(); ch();
      };
      aspectRow.appendChild(btn);
    }
    canvasSec.appendChild(aspectRow);

    // ── ② Colors ──────────────────────────────────────────────────────────
    const colorSec = section(body, `🎨 Colors (${s.colors.length}/8)`);
    const clRoot = el('div', 'ctrl-color-list');
    colorSec.appendChild(clRoot);
    new ColorList(clRoot, s.colors, ch);

    // ── ③ Render Mode ─────────────────────────────────────────────────────
    const renderSec = section(body, '🔷 Render Mode');
    dropdown(renderSec, s.renderMode, [
      ['waves',  '〰 Waves (mesh grid)'],
      ['blobs',  '🫧 Blobs (SDF metaballs)'],
      ['hybrid', '✦ Hybrid (waves + blobs)'],
    ] as [RenderMode, string][], v => {
      s.renderMode = v; ch();
    });

    // ── ④ Material ────────────────────────────────────────────────────────
    const matSec = section(body, '✨ Material');
    dropdown(matSec, s.material, [
      ['standard',    '● Standard'],
      ['iridescent',  '🌈 Iridescent'],
      ['glass',       '🫧 Glass / Refraction'],
      ['plasma',      '⚡ Plasma'],
      ['silk',        '🎋 Silk'],
    ] as [Material, string][], v => {
      s.material = v; ch(); this.render(); // re-render to show/hide material sliders
    });

    if (s.material === 'iridescent') {
      slider(matSec, 'Sheen', s.iridescence, 0, 1, 0.02, v => { s.iridescence = v; ch(); });
    }
    if (s.material === 'glass') {
      slider(matSec, 'Refraction',  s.refraction,          0, 1, 0.02, v => { s.refraction = v; ch(); });
      slider(matSec, 'Chrom. Ab.',  s.chromaticAberration, 0, 2, 0.05, v => { s.chromaticAberration = v; ch(); });
    }

    // ── ⑤ Motion Mode ─────────────────────────────────────────────────────
    const motSec = section(body, '🎬 Motion');
    const motionOptions = (Object.keys(MOTION_MODE_LABELS) as MotionMode[])
      .map(k => [k, MOTION_MODE_LABELS[k]] as [MotionMode, string]);
    dropdown(motSec, s.motionMode, motionOptions, v => {
      if (v !== 'custom') {
        patch(s, MOTION_MODES[v]);
        this.engine.markDirty();
        this.onChange();
        this.render();
      } else {
        s.motionMode = 'custom'; ch();
      }
    });
    slider(motSec, 'Intensity', s.motionIntensity, 0, 1, 0.02, v => { s.motionIntensity = v; ch(); });
    slider(motSec, 'Speed',     s.speed,           0, 4, 0.05, v => { s.speed = v; ch(); });

    // ── ⑥ Mesh Transform ──────────────────────────────────────────────────
    const xformSec = section(body, '🔲 Mesh Transform');
    const xformGrid = el('div', 'ctrl-grid-3');
    const setCustomMotion = () => { if (s.motionMode !== 'custom') s.motionMode = 'custom'; ch(); };
    slider(xformGrid,'Pos X', s.positionX,-400,400,1,  v=>{s.positionX=v; ch();});
    slider(xformGrid,'Pos Y', s.positionY,-300,300,1,  v=>{s.positionY=v; ch();});
    slider(xformGrid,'Pos Z', s.positionZ,-300,300,1,  v=>{s.positionZ=v; ch();});
    slider(xformGrid,'Scale X',s.scaleX, 0.5,20,0.1,  v=>{s.scaleX=v;  ch();});
    slider(xformGrid,'Scale Y',s.scaleY, 0.5,20,0.1,  v=>{s.scaleY=v;  ch();});
    slider(xformGrid,'Scale Z',s.scaleZ, 0.5,20,0.1,  v=>{s.scaleZ=v;  ch();});
    slider(xformGrid,'Rot X',  s.rotationX,-Math.PI,Math.PI,0.01,v=>{s.rotationX=v; ch();});
    slider(xformGrid,'Rot Y',  s.rotationY,-Math.PI,Math.PI,0.01,v=>{s.rotationY=v; ch();});
    slider(xformGrid,'Rot Z',  s.rotationZ,-Math.PI,Math.PI,0.01,v=>{s.rotationZ=v; ch();});
    void setCustomMotion; // available for future use by slider wrappers
    xformSec.appendChild(xformGrid);

    // ── ⑦ Displacement ────────────────────────────────────────────────────
    const dispSec = section(body, '〰 Displacement');
    slider(dispSec,'Freq X', s.displaceFreqX,0.0005,0.05,0.0005,v=>{s.displaceFreqX=v; setCustomMotion();});
    slider(dispSec,'Freq Z', s.displaceFreqZ,0.0005,0.05,0.0005,v=>{s.displaceFreqZ=v; setCustomMotion();});
    slider(dispSec,'Amount', s.displaceAmount,-30,30,0.1,v=>{s.displaceAmount=v; setCustomMotion();});

    // ── ⑧ Twist ───────────────────────────────────────────────────────────
    const twistSec = section(body, '🌀 Twist');
    const twistGrid = el('div', 'ctrl-grid-3');
    slider(twistGrid,'Freq X',s.twistFreqX,-3,3,0.01,v=>{s.twistFreqX=v; setCustomMotion();});
    slider(twistGrid,'Freq Y',s.twistFreqY,-3,3,0.01,v=>{s.twistFreqY=v; setCustomMotion();});
    slider(twistGrid,'Freq Z',s.twistFreqZ,-3,3,0.01,v=>{s.twistFreqZ=v; setCustomMotion();});
    slider(twistGrid,'Pow X', s.twistPowX, 0,8,0.05, v=>{s.twistPowX=v;  setCustomMotion();});
    slider(twistGrid,'Pow Y', s.twistPowY, 0,8,0.05, v=>{s.twistPowY=v;  setCustomMotion();});
    slider(twistGrid,'Pow Z', s.twistPowZ, 0,8,0.05, v=>{s.twistPowZ=v;  setCustomMotion();});
    twistSec.appendChild(twistGrid);

    // ── ⑨ Color Adjust ────────────────────────────────────────────────────
    const adjSec = section(body, '🎛 Color Adjust');
    slider(adjSec,'Contrast',   s.colorContrast,   0.5,3,  0.05,v=>{s.colorContrast=v;   ch();});
    slider(adjSec,'Saturation', s.colorSaturation, 0,  2.5,0.05,v=>{s.colorSaturation=v; ch();});
    slider(adjSec,'Hue Shift',  s.colorHueShift,  -0.5,0.5,0.01,v=>{s.colorHueShift=v;   ch();});

    // ── ⑩ Glow / Bloom ────────────────────────────────────────────────────
    const glowSec = section(body, '✨ Glow');
    slider(glowSec,'Amount',s.glowAmount,0,6,  0.05,v=>{s.glowAmount=v; ch();});
    slider(glowSec,'Power', s.glowPower, 0,1,  0.01,v=>{s.glowPower=v;  ch();});
    slider(glowSec,'Ramp',  s.glowRamp,  0,1,  0.01,v=>{s.glowRamp=v;   ch();});

    // ── ⑪ Post ────────────────────────────────────────────────────────────
    const postSec = section(body, '🎞 Post');
    slider(postSec,'Blur',    s.blur,    0,1,  0.01,v=>{s.blur=v;     ch();});
    slider(postSec,'Grain',   s.grain,   0,2.5,0.05,v=>{s.grain=v;    ch();});
    slider(postSec,'Vignette',s.vignette,0,1.5,0.05,v=>{s.vignette=v; ch();});

    // ── ⑫ Camera ──────────────────────────────────────────────────────────
    const camSec = section(body, '📷 Camera');
    slider(camSec,'FOV°',    s.cameraFov, 20,90,  1,  v=>{s.cameraFov=v;  ch();});
    slider(camSec,'Distance',s.cameraDist,100,1500,10, v=>{s.cameraDist=v; ch();});

    // ── ⑬ Quality ─────────────────────────────────────────────────────────
    const qualSec = section(body, '⚙ Quality');
    slider(qualSec,'Mesh Detail',s.meshDetail,32,160,16,v=>{
      s.meshDetail = v;
      this.engine.applyState({ ...this.engine.state, meshDetail: v });
      ch();
    });
    slider(qualSec,'FPS Cap',s.targetFps,10,60,5,v=>{s.targetFps=v; ch();});
    slider(qualSec,'Seed',   s.seed,     0,99,1, v=>{s.seed=v;     ch();});

    // Background color
    const bgRow = el('div', 'ctrl-color-row');
    const bgLabel = el('span', 'ctrl-slider-label'); bgLabel.textContent = 'Background';
    const bgSwatch = el('div', 'ctrl-color-swatch'); bgSwatch.style.background = s.bgColor;
    const bgPicker = document.createElement('input');
    bgPicker.type = 'color'; bgPicker.className = 'ctrl-color-picker'; bgPicker.value = s.bgColor;
    bgPicker.oninput = () => { s.bgColor=bgPicker.value; bgSwatch.style.background=bgPicker.value; ch(); };
    bgRow.appendChild(bgLabel); bgRow.appendChild(bgSwatch); bgRow.appendChild(bgPicker);
    qualSec.appendChild(bgRow);

    // Hi-DPI toggle
    const dprRow = el('div', 'ctrl-toggle-row');
    const dprLabel = el('label', 'ctrl-toggle-label');
    const dprCheck = document.createElement('input');
    dprCheck.type = 'checkbox'; dprCheck.checked = s.dpr >= 2;
    dprCheck.onchange = () => { s.dpr = dprCheck.checked ? 2 : 1; this.engine.resize(); ch(); };
    dprLabel.appendChild(dprCheck);
    dprLabel.append(' Hi-DPI (2×) Render');
    dprRow.appendChild(dprLabel);
    qualSec.appendChild(dprRow);

    // Wireframe toggle
    const wireRow = el('div', 'ctrl-toggle-row');
    const wireLabel = el('label', 'ctrl-toggle-label');
    const wireCheck = document.createElement('input');
    wireCheck.type = 'checkbox'; wireCheck.checked = s.wireframe;
    wireCheck.onchange = () => { s.wireframe = wireCheck.checked; ch(); };
    wireLabel.appendChild(wireCheck);
    wireLabel.append(' Wireframe Mode');
    wireRow.appendChild(wireLabel);
    qualSec.appendChild(wireRow);
  }
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function section(parent: HTMLElement, title: string): HTMLElement {
  const sec = el('div', 'ctrl-section');
  const h = el('div', 'ctrl-section-title');
  h.textContent = title;
  sec.appendChild(h);
  parent.appendChild(sec);
  return sec;
}

function row(parent: HTMLElement): HTMLElement {
  const r = el('div', 'ctrl-row');
  parent.appendChild(r);
  return r;
}

function numInput(
  parent: HTMLElement, label: string, value: number,
  min: number, max: number, step: number,
  onChange: (v: number) => void,
): void {
  const lbl = el('label', 'ctrl-num-label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'ctrl-num';
  inp.min = String(min); inp.max = String(max); inp.step = String(step);
  inp.value = String(value);
  inp.onchange = () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(v); };
  lbl.appendChild(inp);
  parent.appendChild(lbl);
}

function slider(
  parent: HTMLElement, label: string, value: number,
  min: number, max: number, step: number,
  onChange: (v: number) => void,
): void {
  const r = el('div', 'ctrl-slider-row');
  const lbl = el('span', 'ctrl-slider-label'); lbl.textContent = label;
  const sl = document.createElement('input');
  sl.type = 'range'; sl.className = 'ctrl-slider';
  sl.min = String(min); sl.max = String(max); sl.step = String(step);
  sl.value = String(value);
  const dec = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : 1;
  const val = el('span', 'ctrl-slider-value');
  val.textContent = value.toFixed(dec);
  sl.oninput = () => { const v = parseFloat(sl.value); val.textContent = v.toFixed(dec); onChange(v); };
  r.appendChild(lbl); r.appendChild(sl); r.appendChild(val);
  parent.appendChild(r);
}

function dropdown<T extends string>(
  parent: HTMLElement,
  current: T,
  options: [T, string][],
  onChange: (v: T) => void,
): void {
  const r = el('div', 'ctrl-dropdown-row');
  const sel = document.createElement('select');
  sel.className = 'ctrl-dropdown';
  for (const [val, label] of options) {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (val === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => onChange(sel.value as T);
  r.appendChild(sel);
  parent.appendChild(r);
}
