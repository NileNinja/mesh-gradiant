import type { ColorStop } from '../state/GradientState';

export class ColorList {
  private root: HTMLElement;
  private colors: ColorStop[];
  private onChange: () => void;
  private dragIdx = -1;

  constructor(
    container: HTMLElement,
    colors: ColorStop[],
    onChange: () => void,
  ) {
    this.colors  = colors;
    this.onChange = onChange;
    this.root = container;
    this.render();
  }

  update(colors: ColorStop[]) {
    this.colors = colors;
    this.render();
  }

  private render() {
    this.root.textContent = '';
    const c = this.colors;

    for (let i = 0; i < c.length; i++) {
      this.root.appendChild(this.buildRow(i));
    }

    if (c.length < 8) {
      const addBtn = document.createElement('button');
      addBtn.className = 'ctrl-add-btn';
      addBtn.textContent = '+ Add Color';
      addBtn.onclick = () => {
        const h = (c.length * 60) % 360;
        c.push({ hex: hsl2hex(h, 75, 55), alpha: 1 });
        this.onChange();
        this.render();
      };
      this.root.appendChild(addBtn);
    }
  }

  private buildRow(i: number): HTMLElement {
    const c = this.colors;
    const stop = c[i];

    const row = document.createElement('div');
    row.className = 'ctrl-color-row';
    row.draggable = true;

    // ── Drag handle ─────────────────────────────────────────────────
    const handle = document.createElement('span');
    handle.className = 'ctrl-drag-handle';
    handle.textContent = '⣿';
    handle.title = 'Drag to reorder';

    row.addEventListener('dragstart', (e) => {
      this.dragIdx = i;
      row.classList.add('dragging');
      e.dataTransfer!.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      this.dragIdx = -1;
      this.root.querySelectorAll('.ctrl-color-row').forEach(r => {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.dragIdx < 0 || this.dragIdx === i) return;
      e.dataTransfer!.dropEffect = 'move';
      row.classList.toggle('drag-over-top',    this.dragIdx > i);
      row.classList.toggle('drag-over-bottom', this.dragIdx < i);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over-top', 'drag-over-bottom');
      if (this.dragIdx < 0 || this.dragIdx === i) return;
      const [moved] = c.splice(this.dragIdx, 1);
      c.splice(i, 0, moved);
      this.dragIdx = -1;
      this.onChange();
      this.render();
    });

    // ── Swatch (alpha-aware checker background) ──────────────────────
    const swatch = document.createElement('div');
    swatch.className = 'ctrl-color-swatch ctrl-color-swatch--alpha';
    swatch.style.setProperty('--swatch-color', stop.hex);
    swatch.style.setProperty('--swatch-alpha', String(stop.alpha));

    // ── Color picker ─────────────────────────────────────────────────
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'ctrl-color-picker';
    picker.value = stop.hex;
    picker.oninput = () => {
      c[i] = { ...c[i], hex: picker.value };
      hexSpan.textContent = picker.value;
      swatch.style.setProperty('--swatch-color', picker.value);
      this.onChange();
    };

    // ── Hex label ────────────────────────────────────────────────────
    const hexSpan = document.createElement('span');
    hexSpan.className = 'ctrl-color-hex';
    hexSpan.textContent = stop.hex;

    // ── Alpha slider ─────────────────────────────────────────────────
    const alphaWrap = document.createElement('div');
    alphaWrap.className = 'ctrl-alpha-wrap';

    const alphaSlider = document.createElement('input');
    alphaSlider.type = 'range';
    alphaSlider.className = 'ctrl-alpha-slider';
    alphaSlider.min = '0'; alphaSlider.max = '100'; alphaSlider.step = '1';
    alphaSlider.value = String(Math.round(stop.alpha * 100));

    const alphaVal = document.createElement('span');
    alphaVal.className = 'ctrl-alpha-val';
    alphaVal.textContent = `${Math.round(stop.alpha * 100)}%`;

    alphaSlider.oninput = () => {
      const a = parseInt(alphaSlider.value) / 100;
      c[i] = { ...c[i], alpha: a };
      swatch.style.setProperty('--swatch-alpha', String(a));
      alphaVal.textContent = `${Math.round(a * 100)}%`;
      this.onChange();
    };

    alphaWrap.appendChild(alphaSlider);
    alphaWrap.appendChild(alphaVal);

    // ── Remove button ─────────────────────────────────────────────────
    const removeBtn = document.createElement('button') as HTMLButtonElement;
    removeBtn.className = 'ctrl-color-remove';
    removeBtn.textContent = '×';
    removeBtn.disabled = c.length <= 2;
    removeBtn.onclick = () => {
      if (c.length > 2) {
        c.splice(i, 1);
        this.onChange();
        this.render();
      }
    };

    row.appendChild(handle);
    row.appendChild(swatch);
    row.appendChild(picker);
    row.appendChild(hexSpan);
    row.appendChild(alphaWrap);
    row.appendChild(removeBtn);
    return row;
  }
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
