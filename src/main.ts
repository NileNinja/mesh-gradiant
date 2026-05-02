import './style.css';
import { GradientEngine } from './engine/GradientEngine';
import { ControlPanel } from './ui/ControlPanel';
import { DEFAULT_STATE, cloneState, serializeState, deserializeState } from './state/GradientState';
import { PRESETS } from './state/presets';
import type { GradientState } from './state/GradientState';

// ── Custom Preset Store (localStorage, no backend) ────────────────────────────
const CUSTOM_KEY = 'meshgrad-custom-presets';

interface CustomPreset {
  id:    string;   // unique timestamp-based ID
  name:  string;
  emoji: string;   // derived from dominant color
  state: string;   // base64-encoded serialized GradientState
}

const CustomPresets = {
  load(): CustomPreset[] {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]'); } catch { return []; }
  },
  save(list: CustomPreset[]) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  },
  add(name: string, state: GradientState): CustomPreset {
    const list = CustomPresets.load();
    // Pick an emoji based on the first color's red channel as a rough hue proxy
    const hueEmojis = ['🔴','🟠','🟡','🟢','🔵','🟣','⚪','🌈'];
    const r = parseInt(state.colors[0]?.slice(1, 3) ?? '80', 16);
    const emoji = hueEmojis[Math.floor((r / 256) * (hueEmojis.length - 1))];
    const preset: CustomPreset = { id: `${Date.now()}`, name, emoji, state: serializeState(state) };
    list.unshift(preset);   // newest first
    CustomPresets.save(list);
    return preset;
  },
  remove(id: string) {
    CustomPresets.save(CustomPresets.load().filter(p => p.id !== id));
  },
  decode(p: CustomPreset): GradientState | null {
    return deserializeState(p.state);
  },
};


// ── App ─────────────────────────────────────────────────────────────────────

let engine: GradientEngine;
let panel: ControlPanel;
let mediaRecorder: MediaRecorder | null = null;
let recording = false;

function init() {
  // ── Load saved state or use default ─────────────────────────────────────
  const saved = localStorage.getItem('meshgrad-state');
  const state = saved ? (deserializeState(saved) ?? cloneState(DEFAULT_STATE)) : cloneState(DEFAULT_STATE);

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.getElementById('gradient-canvas') as HTMLCanvasElement;
  engine = new GradientEngine(canvas, state);

  // ── Control panel ─────────────────────────────────────────────────────────
  const panelEl = document.getElementById('ctrl-panel-root')!;
  panel = new ControlPanel(panelEl, engine, onStateChange);

  // ── FPS display ───────────────────────────────────────────────────────────
  const fpsEl   = document.getElementById('status-fps')!;
  const sizeEl  = document.getElementById('status-size')!;
  const meshEl  = document.getElementById('status-mesh')!;

  engine.onFrame = (fps) => {
    fpsEl.textContent  = `${Math.round(fps)} fps`;
    sizeEl.textContent = `${engine.state.canvasWidth} × ${engine.state.canvasHeight}`;
    meshEl.textContent = `Mesh ${engine.state.meshDetail}²`;
  };

  engine.start();

  // ── Engine watchdog: restart if RAF loop dies silently ────────────────────
  // Covers the case where the GPU driver resets without a webglcontextlost event.
  // Checks every 3 s — if lastFrameTime hasn't advanced, restart the loop.
  setInterval(() => {
    if (!engine.state.paused && (performance.now() - engine.lastFrameTime) > 4000) {
      console.warn('[Watchdog] Engine loop appears stalled — restarting...');
      engine.stop();
      engine.start();
    }
  }, 3000);

  buildPresetDropdown();

  // ── Toolbar buttons ───────────────────────────────────────────────────────
  document.getElementById('btn-play-pause')!.onclick = () => {
    engine.state.paused = !engine.state.paused;
    const btn = document.getElementById('btn-play-pause')!;
    btn.textContent = engine.state.paused ? '▶ Play' : '⏸ Pause';
  };

  document.getElementById('btn-panel-toggle')!.onclick = () => {
    const sidebar = document.querySelector('.panel-sidebar')!;
    sidebar.classList.toggle('hidden');
  };

  document.getElementById('btn-export-png')!.onclick = async () => {
    const blob = await engine.snapshot();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mesh-gradient-${Date.now()}.png`;
    a.click(); URL.revokeObjectURL(url);
  };

  document.getElementById('btn-export-css')!.onclick = () => {
    const s = engine.state;
    const colors = s.colors.join(', ');
    const css = `/* Mesh Gradient — MeshStudio */\nbackground: linear-gradient(135deg, ${colors});`;
    navigator.clipboard.writeText(css).then(() => showToast('CSS copied!'));
  };

  document.getElementById('btn-copy-state')!.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('s', serializeState(engine.state));
    navigator.clipboard.writeText(url.toString()).then(() => showToast('Link copied!'));
  };

  document.getElementById('btn-record')!.onclick     = toggleRecord;
  document.getElementById('btn-randomize')!.onclick  = randomize;
  document.getElementById('btn-save-preset')!.onclick = savePreset;

  // ── Share URL state load ──────────────────────────────────────────────────
  const urlState = new URLSearchParams(location.search).get('s');
  if (urlState) {
    const parsed = deserializeState(urlState);
    if (parsed) { engine.applyState(parsed); panel.render(); }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ') { e.preventDefault(); engine.state.paused = !engine.state.paused; }
    if (e.key.toLowerCase() === 'p') document.getElementById('btn-export-png')!.click();
    if (e.key.toLowerCase() === 'r') document.getElementById('btn-record')!.click();
    if (e.key.toLowerCase() === 't') document.querySelector<HTMLElement>('.panel-sidebar')?.classList.toggle('hidden');
    if (e.key.toLowerCase() === 'w') { engine.state.wireframe = !engine.state.wireframe; }
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) savePreset();
  });
}

// ── State change handler ──────────────────────────────────────────────────
function onStateChange() {
  engine.markDirty();
  localStorage.setItem('meshgrad-state', serializeState(engine.state));
}

// ── Preset dropdown ────────────────────────────────────────────────────────
function buildPresetDropdown() {
  const btn = document.getElementById('preset-btn')!;
  const dd  = document.getElementById('preset-dropdown')!;

  btn.onclick = (e) => { e.stopPropagation(); dd.classList.toggle('open'); };
  document.addEventListener('click', () => dd.classList.remove('open'));

  renderDropdown();
}

function renderDropdown() {
  const dd = document.getElementById('preset-dropdown')!;
  dd.innerHTML = '';

  const applyState = (name: string, emoji: string, state: GradientState) => {
    engine.applyState(cloneState(state));
    panel.render();
    document.getElementById('preset-name')!.textContent = emoji + '\u00a0\u00a0' + name;
    dd.classList.remove('open');
    onStateChange();
  };

  // ── Custom presets ───────────────────────────────────────────────────────
  const customs = CustomPresets.load();
  if (customs.length > 0) {
    const lbl = document.createElement('div');
    lbl.className = 'preset-section-label';
    lbl.textContent = 'MY PRESETS';
    dd.appendChild(lbl);

    for (const cp of customs) {
      const state = CustomPresets.decode(cp);
      const item  = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <span class="preset-item-emoji">${cp.emoji}</span>
        <div class="preset-item-info"><strong>${cp.name}</strong></div>
        <button class="preset-item-delete" title="Delete preset">🗑</button>`;

      item.querySelector<HTMLButtonElement>('.preset-item-delete')!.onclick = (e) => {
        e.stopPropagation();
        CustomPresets.remove(cp.id);
        renderDropdown();
        showToast(`Deleted "${cp.name}"`);
      };

      if (state) {
        item.onclick = (e) => {
          if ((e.target as HTMLElement).closest('.preset-item-delete')) return;
          applyState(cp.name, cp.emoji, state);
        };
      } else {
        item.style.opacity = '0.5';
        item.title = 'Corrupted — cannot load';
      }
      dd.appendChild(item);
    }

    const divider = document.createElement('div');
    divider.className = 'preset-divider';
    dd.appendChild(divider);

    const lbl2 = document.createElement('div');
    lbl2.className = 'preset-section-label';
    lbl2.textContent = 'BUILT-IN';
    dd.appendChild(lbl2);
  }

  // ── Built-in presets ────────────────────────────────────────────────────
  for (const preset of PRESETS) {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <span class="preset-item-emoji">${preset.emoji}</span>
      <div class="preset-item-info">
        <strong>${preset.name}</strong>
        <small>${preset.description}</small>
      </div>`;
    item.onclick = () => applyState(preset.name, preset.emoji, preset.state);
    dd.appendChild(item);
  }
}

// ── Save current state as a named custom preset ────────────────────────────
function savePreset() {
  // Custom modal — prompt() is blocked in some environments and looks bad
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">Save Preset</div>
      <input id="modal-preset-name" class="modal-input"
             type="text" placeholder="e.g. My Blue Gradient"
             value="My Gradient" maxlength="40" spellcheck="false" autocomplete="off"/>
      <div class="modal-actions">
        <button id="modal-cancel" class="modal-btn">Cancel</button>
        <button id="modal-save"   class="modal-btn modal-btn--primary">⭐ Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input  = overlay.querySelector<HTMLInputElement>('#modal-preset-name')!;
  const cancel = overlay.querySelector<HTMLButtonElement>('#modal-cancel')!;
  const save   = overlay.querySelector<HTMLButtonElement>('#modal-save')!;

  // Pre-select text so user can just start typing
  requestAnimationFrame(() => { input.focus(); input.select(); });

  const commit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    overlay.remove();
    const cp = CustomPresets.add(name, cloneState(engine.state));
    renderDropdown();
    document.getElementById('preset-name')!.textContent = cp.emoji + '\u00a0\u00a0' + name;
    showToast(`⭐ Saved "${name}"`);
  };

  const close = () => overlay.remove();

  save.onclick   = commit;
  cancel.onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') close();
  });
}

// ── Randomize ─────────────────────────────────────────────────────────────
function randomize() {
  const s = engine.state;
  const rnd = (min: number, max: number) => min + Math.random() * (max - min);

  // Generate a vivid hex color from HSL (high saturation, mid-high lightness)
  // Stored as hex so color pickers display correctly & engine always parses it
  const rndHex = () => {
    const h = Math.random() * 360;
    const sat = 65 + Math.random() * 30;   // 65–95%
    const lit = 45 + Math.random() * 25;   // 45–70%
    // Convert HSL → RGB → hex inline
    const hf = h / 360, sf = sat / 100, lf = lit / 100;
    const q = lf < 0.5 ? lf * (1 + sf) : lf + sf - lf * sf;
    const p = 2 * lf - q;
    const hue2r = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q-p)*6*t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q-p)*(2/3-t)*6;
      return p;
    };
    const r = Math.round(hue2r(hf + 1/3) * 255);
    const g = Math.round(hue2r(hf      ) * 255);
    const b = Math.round(hue2r(hf - 1/3) * 255);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  };

  const count = 3 + (Math.random() * 3 | 0);  // 3–5 colors
  s.colors = Array.from({ length: count }, rndHex);

  // Reset position — otherwise leftover extreme values push the mesh off-canvas
  s.positionX = 0; s.positionY = 0; s.positionZ = 0;

  s.rotationX = rnd(-Math.PI / 2, 0);
  s.rotationY = rnd(-0.5, 0.5);
  s.rotationZ = rnd(0, Math.PI * 2);
  s.scaleX = rnd(5, 10); s.scaleY = rnd(3, 6); s.scaleZ = rnd(5, 10);
  s.displaceFreqX = rnd(0.002, 0.012);
  s.displaceFreqZ = rnd(0.004, 0.018);
  s.displaceAmount = rnd(-10, -3);  // cap at -10 to avoid extreme geometry

  // Constrain twist to safe ranges — high pow values cause extreme vertex
  // displacement that can freeze rendering or black-out the canvas
  s.twistFreqX = rnd(-1.0, 1.0); s.twistFreqY = rnd(-0.6, 0.6); s.twistFreqZ = rnd(-1.0, 1.0);
  s.twistPowX  = rnd(0, 2.5);    s.twistPowY  = rnd(0, 1.2);    s.twistPowZ  = rnd(0, 2.5);

  s.colorHueShift   = rnd(-0.3, 0.3);
  s.colorSaturation = rnd(0.8, 1.3);  // subtle — heavy sat changes look wrong
  s.colorContrast   = rnd(0.9, 1.2);  // keep contrast near 1 to avoid black-out
  s.glowAmount = rnd(0.5, 2.5);

  panel.render();
  onStateChange();
}

// ── Video recording ───────────────────────────────────────────────────────
function toggleRecord() {
  const btn = document.getElementById('btn-record')!;
  if (recording) {
    mediaRecorder?.stop();
    recording = false;
    btn.textContent = '⏺ Record';
    btn.classList.remove('recording');
    return;
  }
  const canvas = document.getElementById('gradient-canvas') as HTMLCanvasElement;
  const stream = (canvas as any).captureStream?.(30);
  if (!stream) { showToast('captureStream not supported'); return; }
  const chunks: Blob[] = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `mesh-gradient-${Date.now()}.webm`;
    a.click(); URL.revokeObjectURL(url);
  };
  mediaRecorder.start();
  recording = true;
  btn.textContent = '⏹ Stop';
  btn.classList.add('recording');
}

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.style.opacity = '0', 1800);
  setTimeout(() => t.remove(), 2200);
}

// ── Boot ──────────────────────────────────────────────────────────────────
try {
  init();
} catch (err) {
  console.error('MeshStudio init failed:', err);
  document.body.innerHTML += `<div style="position:fixed;top:60px;left:50%;transform:translateX(-50%);
    background:#1a0000;border:1px solid #ff4444;color:#ff8888;padding:16px 24px;
    border-radius:8px;font-family:monospace;font-size:12px;max-width:80%;white-space:pre-wrap;z-index:9999">
    Error: ${err}</div>`;
}
