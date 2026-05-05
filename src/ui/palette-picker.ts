import {
  TF_PRESET_LIST,
  type TfPresetMeta,
  type TfPresetName,
  TransferFn,
} from '@/render/transfer-fn';
import { type AppState, presetFor } from '@/state/app-state';
import { el } from './dom';

const SWATCH_W = 96;
const SWATCH_H = 18;

export class PalettePicker {
  private readonly buttons = new Map<TfPresetName, HTMLButtonElement>();
  private last: TfPresetName;

  constructor(
    host: HTMLElement,
    private readonly state: AppState,
  ) {
    this.last = state.tfPreset;
    const wrap = el('div', { className: 'palette-wrap' }, [
      el('h4', { textContent: 'Color Palettes' }),
    ]);
    const clinical = makeSection('clinical', 'Clinical (auto W/L)');
    const colormaps = makeSection('colormaps', 'Colormaps');

    for (const meta of TF_PRESET_LIST) {
      const btn = this.makeSwatch(meta);
      this.buttons.set(meta.name, btn);
      (meta.kind === 'clinical' ? clinical.grid : colormaps.grid).append(btn);
    }
    wrap.append(clinical.section, colormaps.section);
    host.append(wrap);
    this.markSelected(this.last);
  }

  refresh(): void {
    if (this.state.tfPreset !== this.last) {
      this.markSelected(this.state.tfPreset);
      this.last = this.state.tfPreset;
    }
  }

  private markSelected(name: TfPresetName | 'custom'): void {
    for (const [k, btn] of this.buttons) btn.classList.toggle('selected', k === name);
  }

  private makeSwatch(meta: TfPresetMeta): HTMLButtonElement {
    const canvas = el('canvas', {
      className: 'swatch-grad',
      width: SWATCH_W,
      height: SWATCH_H,
    });
    drawSwatch(canvas, TransferFn.preset(meta.name));
    const btn = el(
      'button',
      {
        type: 'button',
        className: 'swatch',
        title: `${meta.label} · ${meta.kind === 'clinical' ? 'auto-pairs W/L' : 'colormap only'}`,
      },
      [canvas, el('span', { className: 'swatch-label', textContent: meta.label })],
    );
    btn.dataset.preset = meta.name;
    btn.addEventListener('click', () => this.apply(meta.name));
    return btn;
  }

  private apply(name: TfPresetName): void {
    const { tf, wl } = presetFor(name);
    if (wl !== null) this.state.setWindowLevel(wl);
    this.state.setTransferFn(tf, name);
    this.markSelected(name);
    this.last = name;
  }
}

function drawSwatch(canvas: HTMLCanvasElement, tf: TransferFn): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const lut = new Uint8Array(256 * 4);
  tf.rasterize(lut, -1024, 3071);
  const img = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const i = Math.min(255, Math.floor((x / Math.max(1, w - 1)) * 255));
    const [r, g, b, aRaw] = [lut[i * 4]!, lut[i * 4 + 1]!, lut[i * 4 + 2]!, lut[i * 4 + 3]!];
    const a = aRaw / 255;
    for (let y = 0; y < h; y++) {
      const c = ((x >>> 2) ^ (y >>> 2)) & 1 ? 32 : 18;
      const p = (y * w + x) * 4;
      img.data[p] = Math.round(r * a + c * (1 - a));
      img.data[p + 1] = Math.round(g * a + c * (1 - a));
      img.data[p + 2] = Math.round(b * a + c * (1 - a));
      img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function makeSection(cls: string, title: string): { section: HTMLElement; grid: HTMLElement } {
  const grid = el('div', { className: 'palette-grid' });
  const section = el('div', { className: `palette-section ${cls}` }, [
    el('span', { className: 'palette-section-title', textContent: title }),
    grid,
  ]);
  return { section, grid };
}
