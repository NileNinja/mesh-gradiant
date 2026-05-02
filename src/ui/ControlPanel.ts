/**
 * ControlPanel — Full parameter UI matching the original Stripe gradient tool.
 *
 * Sections:
 *  ① Canvas Size — width, height, aspect presets
 *  ② Colors — 2-6 color pickers with add/remove
 *  ③ Mesh Transform — position X/Y/Z, scale X/Y/Z, rotation X/Y/Z
 *  ④ Displacement — freqX, freqZ, amount
 *  ⑤ Twist — freqX/Y/Z, powX/Y/Z
 *  ⑥ Color Adjust — contrast, saturation, hue shift
 *  ⑦ Glow — amount, power, ramp
 *  ⑧ Post — blur, grain, vignette
 *  ⑨ Camera — fov, distance
 *  ⑩ Animation — speed, pause
 *  ⑪ Quality — mesh detail, wireframe
 */

import type { GradientState } from '../state/GradientState';
import type { GradientEngine } from '../engine/GradientEngine';

export class ControlPanel {
  private root: HTMLElement;
  private engine: GradientEngine;
  private onChange: () => void;

  constructor(container: HTMLElement, engine: GradientEngine, onChange: () => void) {
    this.engine = engine;
    this.onChange = onChange;
    this.root = document.createElement('div');
    this.root.className = 'ctrl-panel';
    container.appendChild(this.root);
    this.render();
  }

  private get s(): GradientState { return this.engine.state; }

  render() {
    this.root.innerHTML = '';
    const body = this.root;
    const s = this.s;

    // ── ① Canvas Size ─────────────────────────────────────────────────────
    const canvasSec = section(body, '📐 Canvas Size');
    const sizeRow = row(canvasSec);
    const cwIn = numInput(sizeRow, 'W', s.canvasWidth, 200, 7680, 10, v => {
      s.canvasWidth = v; this.engine.resize(); this.onChange();
    });
    const chIn = numInput(sizeRow, 'H', s.canvasHeight, 200, 4320, 10, v => {
      s.canvasHeight = v; this.engine.resize(); this.onChange();
    });
    void cwIn; void chIn;

    const aspectRow = el('div', 'ctrl-aspect-row');
    const aspects: [string, number, number][] = [
      ['16:9',1920,1080],['4:3',1440,1080],['1:1',1080,1080],['3:2',1620,1080],['21:9',2520,1080],
    ];
    for (const [lbl, w, h] of aspects) {
      const btn = el('button', 'ctrl-tag-btn');
      btn.textContent = lbl;
      btn.onclick = () => {
        const scale = 1200 / w;
        s.canvasWidth  = Math.round(w * scale);
        s.canvasHeight = Math.round(h * scale);
        this.engine.resize(); this.render(); this.onChange();
      };
      aspectRow.appendChild(btn);
    }
    canvasSec.appendChild(aspectRow);

    // ── ② Colors ──────────────────────────────────────────────────────────
    const colorSec = section(body, `🎨 Colors (${s.colors.length}/6)`);
    for (let ci = 0; ci < s.colors.length; ci++) {
      const i = ci;
      const cr = el('div', 'ctrl-color-row');
      const swatch = el('div', 'ctrl-color-swatch');
      swatch.style.background = s.colors[i];
      const picker = document.createElement('input');
      picker.type = 'color'; picker.className = 'ctrl-color-picker'; picker.value = s.colors[i];
      picker.oninput = () => {
        s.colors[i] = picker.value;
        swatch.style.background = picker.value;
        this.onChange();
      };
      const hexSpan = el('span', 'ctrl-color-hex');
      hexSpan.textContent = s.colors[i];
      picker.oninput = () => {
        s.colors[i] = picker.value;
        swatch.style.background = picker.value;
        hexSpan.textContent = picker.value;
        this.engine.markDirty();
        this.onChange();
      };
      const removeBtn = el('button', 'ctrl-color-remove') as HTMLButtonElement;
      removeBtn.textContent = '×';
      removeBtn.disabled = s.colors.length <= 2;
      removeBtn.onclick = () => {
        if (s.colors.length > 2) { s.colors.splice(i, 1); this.render(); this.onChange(); }
      };
      cr.appendChild(swatch); cr.appendChild(picker); cr.appendChild(hexSpan); cr.appendChild(removeBtn);
      colorSec.appendChild(cr);
    }
    if (s.colors.length < 6) {
      const addBtn = el('button', 'ctrl-add-btn');
      addBtn.textContent = '+ Add Color';
      addBtn.onclick = () => {
        const h = (s.colors.length * 60) % 360;
        s.colors.push(hsl2hex(h, 80, 60));
        this.render(); this.onChange();
      };
      colorSec.appendChild(addBtn);
    }

    // ── ③ Mesh Transform ──────────────────────────────────────────────────
    const xformSec = section(body, '🔲 Mesh Transform');
    const xformGrid = el('div', 'ctrl-grid-3');

    slider(xformGrid, 'Pos X', s.positionX, -400, 400, 1,  v => { s.positionX=v; this.onChange(); });
    slider(xformGrid, 'Pos Y', s.positionY, -300, 300, 1,  v => { s.positionY=v; this.onChange(); });
    slider(xformGrid, 'Pos Z', s.positionZ, -300, 300, 1,  v => { s.positionZ=v; this.onChange(); });

    slider(xformGrid, 'Scale X', s.scaleX, 0.5, 20, 0.1, v => { s.scaleX=v; this.onChange(); });
    slider(xformGrid, 'Scale Y', s.scaleY, 0.5, 20, 0.1, v => { s.scaleY=v; this.onChange(); });
    slider(xformGrid, 'Scale Z', s.scaleZ, 0.5, 20, 0.1, v => { s.scaleZ=v; this.onChange(); });

    slider(xformGrid, 'Rot X', s.rotationX, -Math.PI, Math.PI, 0.01, v => { s.rotationX=v; this.onChange(); });
    slider(xformGrid, 'Rot Y', s.rotationY, -Math.PI, Math.PI, 0.01, v => { s.rotationY=v; this.onChange(); });
    slider(xformGrid, 'Rot Z', s.rotationZ, -Math.PI, Math.PI, 0.01, v => { s.rotationZ=v; this.onChange(); });
    xformSec.appendChild(xformGrid);

    // ── ④ Displacement ────────────────────────────────────────────────────
    const dispSec = section(body, '〰 Displacement');
    const D = (v: number) => { this.engine.markDirty(); this.onChange(); return v; };
    slider(dispSec, 'Freq X', s.displaceFreqX, 0.0005, 0.05, 0.0005, v => { s.displaceFreqX=v; D(v); });
    slider(dispSec, 'Freq Z', s.displaceFreqZ, 0.0005, 0.05, 0.0005, v => { s.displaceFreqZ=v; D(v); });
    slider(dispSec, 'Amount', s.displaceAmount,-30, 30,  0.1,         v => { s.displaceAmount=v; D(v); });

    // ── ⑤ Twist ───────────────────────────────────────────────────────────
    const twistSec = section(body, '🌀 Twist');
    const twistGrid = el('div', 'ctrl-grid-3');
    const T = (v: number) => { this.engine.markDirty(); this.onChange(); return v; };
    slider(twistGrid, 'Freq X', s.twistFreqX, -3, 3, 0.01, v => { s.twistFreqX=v; T(v); });
    slider(twistGrid, 'Freq Y', s.twistFreqY, -3, 3, 0.01, v => { s.twistFreqY=v; T(v); });
    slider(twistGrid, 'Freq Z', s.twistFreqZ, -3, 3, 0.01, v => { s.twistFreqZ=v; T(v); });
    slider(twistGrid, 'Pow X',  s.twistPowX,  0, 8, 0.05,  v => { s.twistPowX=v;  T(v); });
    slider(twistGrid, 'Pow Y',  s.twistPowY,  0, 8, 0.05,  v => { s.twistPowY=v;  T(v); });
    slider(twistGrid, 'Pow Z',  s.twistPowZ,  0, 8, 0.05,  v => { s.twistPowZ=v;  T(v); });
    twistSec.appendChild(twistGrid);

    // ── ⑥ Color Adjust ────────────────────────────────────────────────────
    const adjSec = section(body, '🎛 Color Adjust');
    slider(adjSec, 'Contrast',   s.colorContrast,   0.5, 3,  0.05, v => { s.colorContrast=v;   this.onChange(); });
    slider(adjSec, 'Saturation', s.colorSaturation, 0,   2.5,0.05, v => { s.colorSaturation=v; this.onChange(); });
    slider(adjSec, 'Hue Shift',  s.colorHueShift,  -0.5, 0.5,0.01, v => { s.colorHueShift=v;   this.onChange(); });

    // ── ⑦ Glow / Bloom ────────────────────────────────────────────────────
    const glowSec = section(body, '✨ Glow');
    slider(glowSec, 'Amount', s.glowAmount, 0, 6,   0.05, v => { s.glowAmount=v; this.onChange(); });
    slider(glowSec, 'Power',  s.glowPower,  0, 1,   0.01, v => { s.glowPower=v;  this.onChange(); });
    slider(glowSec, 'Ramp',   s.glowRamp,   0, 1,   0.01, v => { s.glowRamp=v;   this.onChange(); });

    // ── ⑧ Post-Processing ─────────────────────────────────────────────────
    const postSec = section(body, '🎞 Post');
    slider(postSec, 'Blur',     s.blur,     0, 1,   0.01, v => { s.blur=v;     this.onChange(); });
    slider(postSec, 'Grain',    s.grain,    0, 2.5, 0.05, v => { s.grain=v;    this.onChange(); });
    slider(postSec, 'Vignette', s.vignette, 0, 1.5, 0.05, v => { s.vignette=v; this.onChange(); });

    // ── ⑨ Camera ──────────────────────────────────────────────────────────
    const camSec = section(body, '📷 Camera');
    slider(camSec, 'FOV°',     s.cameraFov,  20, 90,   1,   v => { s.cameraFov=v;  this.onChange(); });
    slider(camSec, 'Distance', s.cameraDist, 100, 1500, 10,  v => { s.cameraDist=v; this.onChange(); });

    // ── ⑩ Animation ───────────────────────────────────────────────────────
    const animSec = section(body, '⏱ Animation');
    slider(animSec, 'Speed', s.speed, 0, 4, 0.05, v => { s.speed=v; this.onChange(); });

    // ── ⑪ Quality ─────────────────────────────────────────────────────────
    const qualSec = section(body, '⚙ Quality');
    slider(qualSec, 'Mesh Detail', s.meshDetail, 32, 160, 16, v => {
      s.meshDetail = v;
      this.engine.applyState({ ...this.engine.state, meshDetail: v });
      this.onChange();
    });
    slider(qualSec, 'FPS Cap', s.targetFps, 10, 60, 5, v => {
      s.targetFps = v; this.engine.markDirty(); this.onChange();
    });

    // Background Color
    const bgRow = el('div', 'ctrl-color-row');
    const bgLabel = el('span', 'ctrl-slider-label'); bgLabel.textContent = 'Background';
    const bgSwatch = el('div', 'ctrl-color-swatch'); bgSwatch.style.background = s.bgColor;
    const bgPicker = document.createElement('input');
    bgPicker.type = 'color'; bgPicker.className = 'ctrl-color-picker'; bgPicker.value = s.bgColor;
    bgPicker.oninput = () => {
      s.bgColor = bgPicker.value;
      bgSwatch.style.background = bgPicker.value;
      this.engine.markDirty();
      this.onChange();
    };
    bgRow.appendChild(bgLabel); bgRow.appendChild(bgSwatch); bgRow.appendChild(bgPicker);
    qualSec.appendChild(bgRow);

    // 2× DPR toggle
    const dprRow = el('div', 'ctrl-toggle-row');
    const dprLabel = el('label', 'ctrl-toggle-label');
    const dprCheck = document.createElement('input');
    dprCheck.type = 'checkbox'; dprCheck.checked = s.dpr >= 2;
    dprCheck.onchange = () => {
      s.dpr = dprCheck.checked ? 2 : 1;
      this.engine.resize();
      this.onChange();
    };
    dprLabel.appendChild(dprCheck);
    dprLabel.append(' Hi-DPI (2×) Render');
    dprRow.appendChild(dprLabel);
    qualSec.appendChild(dprRow);

    // Wireframe toggle
    const wireRow = el('div', 'ctrl-toggle-row');
    const wireLabel = el('label', 'ctrl-toggle-label');
    const wireCheck = document.createElement('input');
    wireCheck.type = 'checkbox'; wireCheck.checked = s.wireframe;
    wireCheck.onchange = () => { s.wireframe = wireCheck.checked; this.engine.markDirty(); this.onChange(); };
    wireLabel.appendChild(wireCheck);
    wireLabel.append(' Wireframe Mode');
    wireRow.appendChild(wireLabel);
    qualSec.appendChild(wireRow);
  }
}

// ── DOM helpers ────────────────────────────────────────────────────────────

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
): HTMLInputElement {
  const lbl = el('label', 'ctrl-num-label');
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number'; inp.className = 'ctrl-num';
  inp.min = String(min); inp.max = String(max); inp.step = String(step);
  inp.value = String(value);
  inp.onchange = () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(v); };
  lbl.appendChild(inp);
  parent.appendChild(lbl);
  return inp;
}

function slider(
  parent: HTMLElement, label: string, value: number,
  min: number, max: number, step: number,
  onChange: (v: number) => void,
): void {
  const row = el('div', 'ctrl-slider-row');
  const lbl = el('span', 'ctrl-slider-label'); lbl.textContent = label;

  const sl = document.createElement('input');
  sl.type = 'range'; sl.className = 'ctrl-slider';
  sl.min = String(min); sl.max = String(max); sl.step = String(step);
  sl.value = String(value);

  const dec = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : 1;
  const val = el('span', 'ctrl-slider-value');
  val.textContent = value.toFixed(dec);

  sl.oninput = () => {
    const v = parseFloat(sl.value);
    val.textContent = v.toFixed(dec);
    onChange(v);
  };

  row.appendChild(lbl); row.appendChild(sl); row.appendChild(val);
  parent.appendChild(row);
}

function hsl2hex(h: number, s: number, l: number): string {
  l /= 100; s /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
