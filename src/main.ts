import './style.css';
import { GradientEngine } from './engine/GradientEngine';
import { ControlPanel } from './ui/ControlPanel';
import { DEFAULT_STATE, cloneState, serializeState, deserializeState } from './state/GradientState';
import type { GradientState, ColorStop } from './state/GradientState';
import { PRESETS } from './state/presets';
import { genCSS, genNextJs, genReact, genVanilla, genWebComponent, genMediaInstructions } from './export/templates';

// ── Custom Preset Store ────────────────────────────────────────────────────────

const CUSTOM_KEY = 'meshgrad-custom-presets';

interface CustomPreset {
  id:    string;
  name:  string;
  emoji: string;
  state: string;
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
    const hueEmojis = ['🔴','🟠','🟡','🟢','🔵','🟣','⚪','🌈'];
    const r = parseInt((state.colors[0]?.hex ?? '#808080').slice(1, 3), 16);
    const emoji = hueEmojis[Math.floor((r / 256) * (hueEmojis.length - 1))];
    const preset: CustomPreset = { id: `${Date.now()}`, name, emoji, state: serializeState(state) };
    list.unshift(preset);
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

// ── App ───────────────────────────────────────────────────────────────────────

let engine: GradientEngine;
let panel: ControlPanel;
let mediaRecorder: MediaRecorder | null = null;
let recording = false;

function init() {
  // Respect OS reduced-motion preference
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const saved   = localStorage.getItem('meshgrad-state');
  const state   = saved
    ? (deserializeState(saved) ?? cloneState(DEFAULT_STATE))
    : cloneState(DEFAULT_STATE);

  if (prefersReduced) {
    state.paused = true;
    state.reducedMotion = true;
  }

  const canvas = document.getElementById('gradient-canvas') as HTMLCanvasElement;
  engine = new GradientEngine(canvas, state);

  const panelEl = document.getElementById('ctrl-panel-root')!;
  panel = new ControlPanel(panelEl, engine, onStateChange);

  const fpsEl  = document.getElementById('status-fps')!;
  const sizeEl = document.getElementById('status-size')!;
  const meshEl = document.getElementById('status-mesh')!;

  engine.onFrame = (fps) => {
    fpsEl.textContent  = `${Math.round(fps)} fps`;
    sizeEl.textContent = `${engine.state.canvasWidth} × ${engine.state.canvasHeight}`;
    meshEl.textContent = `Mesh ${engine.state.meshDetail}²`;
  };

  engine.start();
  engine.watchVisibility(canvas);

  // ── Reduced-motion banner ────────────────────────────────────────────────
  if (prefersReduced) {
    const banner = document.createElement('div');
    banner.className = 'reduced-motion-banner';
    banner.textContent = '⚠ Paused — reduced-motion preference detected. Press Space to play.';
    document.querySelector('.canvas-viewport')?.prepend(banner);
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      if (!e.matches) { banner.remove(); engine.state.paused = false; }
    });
  }

  // ── Watchdog ─────────────────────────────────────────────────────────────
  setInterval(() => {
    if (!engine.state.paused && (performance.now() - engine.lastFrameTime) > 4000) {
      engine.stop();
      engine.start();
    }
  }, 3000);

  buildPresetDropdown();

  // ── Toolbar ───────────────────────────────────────────────────────────────
  document.getElementById('btn-play-pause')!.onclick = () => {
    engine.state.paused = !engine.state.paused;
    const btn = document.getElementById('btn-play-pause')!;
    btn.textContent = engine.state.paused ? '▶ Play' : '⏸ Pause';
  };

  document.getElementById('btn-panel-toggle')!.onclick = () => {
    document.querySelector('.panel-sidebar')!.classList.toggle('hidden');
  };

  document.getElementById('btn-export-png')!.onclick = async () => {
    const blob = await engine.snapshot();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `mesh-gradient-${Date.now()}.png`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Replace old CSS export with the export panel toggle
  document.getElementById('btn-export-css')!.onclick = () => {
    openExportModal();
  };

  document.getElementById('btn-copy-state')!.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('s', serializeState(engine.state));
    navigator.clipboard.writeText(url.toString()).then(() => showToast('Link copied!'));
  };

  document.getElementById('btn-record')!.onclick    = toggleRecord;
  document.getElementById('btn-randomize')!.onclick = randomize;
  document.getElementById('btn-save-preset')!.onclick = savePreset;

  // ── URL state load ────────────────────────────────────────────────────────
  const urlState = new URLSearchParams(location.search).get('s');
  if (urlState) {
    const parsed = deserializeState(urlState);
    if (parsed) { engine.applyState(parsed); panel.render(); }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === ' ') { e.preventDefault(); engine.state.paused = !engine.state.paused; }
    if (e.key.toLowerCase() === 'p') document.getElementById('btn-export-png')!.click();
    if (e.key.toLowerCase() === 'r') document.getElementById('btn-record')!.click();
    if (e.key.toLowerCase() === 't') document.querySelector<HTMLElement>('.panel-sidebar')?.classList.toggle('hidden');
    if (e.key.toLowerCase() === 'w') { engine.state.wireframe = !engine.state.wireframe; engine.markDirty(); }
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) savePreset();
  });
}

// ── State persistence ─────────────────────────────────────────────────────────

function onStateChange() {
  engine.markDirty();
  localStorage.setItem('meshgrad-state', serializeState(engine.state));
}

// ── Preset dropdown ───────────────────────────────────────────────────────────

function buildPresetDropdown() {
  const btn = document.getElementById('preset-btn')!;
  const dd  = document.getElementById('preset-dropdown')!;
  btn.onclick = (e) => { e.stopPropagation(); dd.classList.toggle('open'); };
  document.addEventListener('click', () => dd.classList.remove('open'));
  renderDropdown();
}

function renderDropdown() {
  const dd = document.getElementById('preset-dropdown')!;
  dd.textContent = '';

  const applyState = (name: string, emoji: string, state: GradientState) => {
    engine.applyState(cloneState(state));
    panel.render();
    document.getElementById('preset-name')!.textContent = emoji + '  ' + name;
    dd.classList.remove('open');
    onStateChange();
  };

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

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'preset-item-emoji';
      emojiSpan.textContent = cp.emoji;

      const info = document.createElement('div');
      info.className = 'preset-item-info';
      const strong = document.createElement('strong');
      strong.textContent = cp.name;
      info.appendChild(strong);

      const del = document.createElement('button');
      del.className = 'preset-item-delete';
      del.title = 'Delete preset';
      del.textContent = '🗑';
      del.onclick = (e) => {
        e.stopPropagation();
        CustomPresets.remove(cp.id);
        renderDropdown();
        showToast(`Deleted "${cp.name}"`);
      };

      item.appendChild(emojiSpan);
      item.appendChild(info);
      item.appendChild(del);

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

  for (const preset of PRESETS) {
    const item = document.createElement('div');
    item.className = 'preset-item';

    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'preset-item-emoji';
    emojiSpan.textContent = preset.emoji;

    const info = document.createElement('div');
    info.className = 'preset-item-info';
    const strong = document.createElement('strong');
    strong.textContent = preset.name;
    const small = document.createElement('small');
    small.textContent = preset.description;
    info.appendChild(strong);
    info.appendChild(small);

    item.appendChild(emojiSpan);
    item.appendChild(info);
    item.onclick = () => applyState(preset.name, preset.emoji, preset.state);
    dd.appendChild(item);
  }
}

// ── Save Preset ───────────────────────────────────────────────────────────────

function savePreset() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-box';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Save Preset';

  const input = document.createElement('input');
  input.id = 'modal-preset-name';
  input.className = 'modal-input';
  input.type = 'text';
  input.placeholder = 'e.g. My Blue Gradient';
  input.value = 'My Gradient';
  input.maxLength = 40;
  input.spellcheck = false;

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn';
  cancelBtn.textContent = 'Cancel';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'modal-btn modal-btn--primary';
  saveBtn.textContent = '⭐ Save';

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  box.appendChild(title);
  box.appendChild(input);
  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => { input.focus(); input.select(); });

  const commit = () => {
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    overlay.remove();
    const cp = CustomPresets.add(name, cloneState(engine.state));
    renderDropdown();
    document.getElementById('preset-name')!.textContent = cp.emoji + '  ' + name;
    showToast(`⭐ Saved "${name}"`);
  };
  const close = () => overlay.remove();

  saveBtn.onclick   = commit;
  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') close();
  });
}

// ── Export Modal ──────────────────────────────────────────────────────────────

type TabKey = 'CSS' | 'Next.js' | 'React' | 'Vanilla HTML' | 'Web Component' | 'Media';

function openExportModal() {
  const s = engine.state;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const box = document.createElement('div');
  box.className = 'modal-box modal-box--wide';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = '↓ Export';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.onclick = () => overlay.remove();

  const tabs: TabKey[] = ['CSS', 'Next.js', 'React', 'Vanilla HTML', 'Web Component', 'Media'];
  const tabBar = document.createElement('div');
  tabBar.className = 'modal-tabs';

  const contentArea = document.createElement('div');
  contentArea.className = 'modal-tab-content';

  const tabBtns: Record<TabKey, HTMLButtonElement> = {} as Record<TabKey, HTMLButtonElement>;

  const renderTab = (tab: TabKey) => {
    contentArea.textContent = '';
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('active', k === tab);

    const addCode = (code: string, label = 'Copy') => {
      const btn = document.createElement('button');
      btn.className = 'modal-copy-btn';
      btn.textContent = label;
      btn.onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = label, 2000);
        });
      };
      const pre = document.createElement('pre');
      pre.className = 'modal-code';
      pre.textContent = code;
      contentArea.appendChild(btn);
      contentArea.appendChild(pre);
    };

    const addNote = (text: string) => {
      const p = document.createElement('p');
      p.className = 'modal-note';
      p.textContent = text;
      contentArea.appendChild(p);
    };

    if (tab === 'CSS') {
      addNote('Static CSS approximation — no JavaScript, no animation. Good as a fallback background.');
      addCode(genCSS(s));
    } else if (tab === 'Next.js') {
      addNote('Next.js App Router component. Copy MeshGradient.tsx + MeshGradientLoader.tsx into your project.');
      const { component, loader, readme } = genNextJs(s);
      addCode(component, 'Copy MeshGradient.tsx');
      addCode(loader,    'Copy MeshGradientLoader.tsx');
      addCode(readme,    'Copy README-nextjs.md');
    } else if (tab === 'React') {
      addNote('Generic React component for Vite / CRA / any React 18+ project.');
      const { component, readme } = genReact(s);
      addCode(component, 'Copy MeshGradient.tsx');
      addCode(readme,    'Copy README-react.md');
    } else if (tab === 'Vanilla HTML') {
      addNote('Drop-in HTML file with CSS fallback. Copy mesh-gradient-runtime.js alongside it.');
      addCode(genVanilla(s));
    } else if (tab === 'Web Component') {
      addNote('Framework-agnostic custom element: <mesh-gradient speed="1">. Copy alongside runtime.');
      addCode(genWebComponent(s));
    } else {
      addNote(genMediaInstructions());
      const pngBtn = document.createElement('button');
      pngBtn.className = 'toolbar-btn primary';
      pngBtn.textContent = '↓ Export PNG';
      pngBtn.onclick = () => { overlay.remove(); document.getElementById('btn-export-png')!.click(); };
      const webmBtn = document.createElement('button');
      webmBtn.className = 'toolbar-btn';
      webmBtn.textContent = '⏺ Record WebM';
      webmBtn.onclick = () => { overlay.remove(); document.getElementById('btn-record')!.click(); };
      const row = document.createElement('div');
      row.className = 'modal-media-row';
      row.appendChild(pngBtn); row.appendChild(webmBtn);
      contentArea.appendChild(row);
    }
  };

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'modal-tab-btn';
    btn.textContent = tab;
    btn.onclick = () => renderTab(tab);
    tabBar.appendChild(btn);
    tabBtns[tab] = btn;
  }

  box.appendChild(title);
  box.appendChild(closeBtn);
  box.appendChild(tabBar);
  box.appendChild(contentArea);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  renderTab('CSS');
}

// ── Randomize ─────────────────────────────────────────────────────────────────

function randomize() {
  const s = engine.state;
  const rnd = (min: number, max: number) => min + Math.random() * (max - min);

  const rndHex = (): string => {
    const h = Math.random() * 360, sat = 65 + Math.random() * 30, lit = 45 + Math.random() * 25;
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
    const r2 = Math.round(hue2r(hf + 1/3) * 255);
    const g2 = Math.round(hue2r(hf      ) * 255);
    const b2 = Math.round(hue2r(hf - 1/3) * 255);
    return '#' + [r2,g2,b2].map(v => v.toString(16).padStart(2,'0')).join('');
  };

  const count = 3 + (Math.random() * 4 | 0);  // 3–6
  const newColors: ColorStop[] = Array.from({ length: count }, () => ({ hex: rndHex(), alpha: 1 }));
  s.colors = newColors;

  s.positionX = 0; s.positionY = 0; s.positionZ = 0;
  s.rotationX = rnd(-Math.PI / 2, 0);
  s.rotationY = rnd(-0.5, 0.5);
  s.rotationZ = rnd(0, Math.PI * 2);
  s.scaleX = rnd(5, 10); s.scaleY = rnd(3, 6); s.scaleZ = rnd(5, 10);
  s.displaceFreqX = rnd(0.002, 0.012);
  s.displaceFreqZ = rnd(0.004, 0.018);
  s.displaceAmount = rnd(-10, -3);
  s.twistFreqX = rnd(-1.0, 1.0); s.twistFreqY = rnd(-0.6, 0.6); s.twistFreqZ = rnd(-1.0, 1.0);
  s.twistPowX  = rnd(0, 2.5);    s.twistPowY  = rnd(0, 1.2);    s.twistPowZ  = rnd(0, 2.5);
  s.colorHueShift   = rnd(-0.3, 0.3);
  s.colorSaturation = rnd(0.8, 1.3);
  s.colorContrast   = rnd(0.9, 1.2);
  s.glowAmount = rnd(0.5, 2.5);
  s.seed = Math.floor(Math.random() * 100);

  panel.render();
  onStateChange();
}

// ── Video recording ───────────────────────────────────────────────────────────

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
  const stream = (canvas as unknown as { captureStream?: (fps: number) => MediaStream }).captureStream?.(30);
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

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.style.opacity = '0', 1800);
  setTimeout(() => t.remove(), 2200);
}

// ── Boot ─────────────────────────────────────────────────────────────────────

try {
  init();
} catch (err) {
  console.error('MeshStudio init failed:', err);
  const errDiv = document.createElement('div');
  errDiv.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#1a0000;border:1px solid #ff4444;color:#ff8888;padding:16px 24px;border-radius:8px;font-family:monospace;font-size:12px;max-width:80%;white-space:pre-wrap;z-index:9999';
  errDiv.textContent = `Error: ${err}`;
  document.body.appendChild(errDiv);
}
