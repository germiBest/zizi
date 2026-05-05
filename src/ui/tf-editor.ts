import { HU } from '@/core/units';
import { type TfPoint, TransferFn } from '@/render/transfer-fn';
import type { AppState } from '@/state/app-state';

export interface HuRange {
  readonly lo: number;
  readonly hi: number;
}
export interface CanvasRect {
  readonly width: number;
  readonly height: number;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

export const huToX = (hu: number, r: HuRange, w: number) =>
  r.hi <= r.lo ? 0 : ((hu - r.lo) / (r.hi - r.lo)) * w;

export const xToHu = (x: number, r: HuRange, w: number) =>
  r.lo + (x / Math.max(1, w)) * (r.hi - r.lo);

export const alphaToY = (a: number, h: number) => h - clamp01(a) * h;
export const yToAlpha = (y: number, h: number) => clamp01(1 - y / Math.max(1, h));

export function findHitPoint(
  points: readonly TfPoint[],
  mx: number,
  my: number,
  range: HuRange,
  rect: CanvasRect,
  threshold = 8,
): number {
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const px = huToX(p.hu as number, range, rect.width);
    const py = alphaToY(p.rgba[3], rect.height);
    if (Math.hypot(mx - px, my - py) <= threshold) return i;
  }
  return -1;
}

export function clampPointHu(hu: number, idx: number, points: readonly TfPoint[]): number {
  const prev = idx > 0 ? (points[idx - 1]!.hu as number) : Number.NEGATIVE_INFINITY;
  const next = idx < points.length - 1 ? (points[idx + 1]!.hu as number) : Number.POSITIVE_INFINITY;
  return Math.max(prev + 1, Math.min(next - 1, hu));
}

export function insertSorted(points: readonly TfPoint[], p: TfPoint): TfPoint[] {
  return [...points, p].sort((a, b) => (a.hu as number) - (b.hu as number));
}

export function removeAt(points: readonly TfPoint[], idx: number): TfPoint[] {
  if (points.length <= 2) return [...points];
  return [...points.slice(0, idx), ...points.slice(idx + 1)];
}

export class TransferFnEditor {
  private readonly canvas: HTMLCanvasElement;
  private readonly cx: CanvasRenderingContext2D;
  private points: TfPoint[];
  private dragIdx = -1;
  private lastTf: TransferFn;
  private lastWl: AppState['wl'];

  constructor(
    host: HTMLElement,
    private readonly state: AppState,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tf-canvas';
    this.canvas.width = 600;
    this.canvas.height = 130;
    host.appendChild(this.canvas);
    const cx = this.canvas.getContext('2d');
    if (!cx) throw new Error('TFEditor: 2d ctx unavailable');
    this.cx = cx;

    this.points = [...state.tf.points];
    this.lastTf = state.tf;
    this.lastWl = state.wl;

    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('contextmenu', this.onContextMenu);
    c.addEventListener('dblclick', this.onDouble);
    this.draw();
  }

  refresh(): void {
    if (this.state.tf !== this.lastTf) {
      this.points = [...this.state.tf.points];
      this.lastTf = this.state.tf;
    }
    if (this.state.wl !== this.lastWl) this.lastWl = this.state.wl;
    this.draw();
  }

  private getRange(): HuRange {
    const lo = (this.state.wl.center as number) - (this.state.wl.width as number) / 2;
    const hi = (this.state.wl.center as number) + (this.state.wl.width as number) / 2;
    return { lo, hi };
  }

  private draw(): void {
    const { width: w, height: h } = this.canvas;
    const range = this.getRange();
    const tf = new TransferFn(this.points);

    this.cx.fillStyle = '#000';
    this.cx.fillRect(0, 0, w, h);

    for (let x = 0; x < w; x++) {
      const rgba = tf.sample(xToHu(x + 0.5, range, w));
      const r = Math.round(rgba[0] * 255);
      const g = Math.round(rgba[1] * 255);
      const b = Math.round(rgba[2] * 255);
      const yTop = alphaToY(rgba[3], h);
      this.cx.fillStyle = `rgba(${r},${g},${b},0.85)`;
      this.cx.fillRect(x, yTop, 1, h - yTop);
    }
    for (const p of this.points) {
      const px = huToX(p.hu as number, range, w);
      const py = alphaToY(p.rgba[3], h);
      const r = Math.round(p.rgba[0] * 255);
      const g = Math.round(p.rgba[1] * 255);
      const b = Math.round(p.rgba[2] * 255);
      this.cx.beginPath();
      this.cx.arc(px, py, 4, 0, Math.PI * 2);
      this.cx.fillStyle = `rgb(${r},${g},${b})`;
      this.cx.fill();
      this.cx.lineWidth = 1.5;
      this.cx.strokeStyle = '#fff';
      this.cx.stroke();
    }
  }

  private localXY(e: MouseEvent | PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / Math.max(1, r.width)),
      y: (e.clientY - r.top) * (this.canvas.height / Math.max(1, r.height)),
    };
  }

  private commit(): void {
    this.state.setTransferFn(new TransferFn(this.points), 'custom');
    this.lastTf = this.state.tf;
    this.draw();
  }

  private rect(): CanvasRect {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button === 2) return;
    const { x, y } = this.localXY(e);
    const idx = findHitPoint(this.points, x, y, this.getRange(), this.rect());
    if (idx >= 0) {
      this.dragIdx = idx;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (this.dragIdx < 0) return;
    const { x, y } = this.localXY(e);
    const newHu = clampPointHu(
      xToHu(x, this.getRange(), this.canvas.width),
      this.dragIdx,
      this.points,
    );
    const newAlpha = yToAlpha(y, this.canvas.height);
    const old = this.points[this.dragIdx]!;
    this.points = this.points.map(
      (p, i): TfPoint =>
        i === this.dragIdx
          ? { hu: HU(newHu), rgba: [old.rgba[0], old.rgba[1], old.rgba[2], newAlpha] as const }
          : p,
    );
    this.commit();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.dragIdx < 0) return;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.dragIdx = -1;
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const { x, y } = this.localXY(e);
    const idx = findHitPoint(this.points, x, y, this.getRange(), this.rect());
    if (idx >= 0 && this.points.length > 2) {
      this.points = removeAt(this.points, idx);
      this.commit();
    }
  };

  private onDouble = (e: MouseEvent): void => {
    const { x, y } = this.localXY(e);
    const newHu = xToHu(x, this.getRange(), this.canvas.width);
    const newAlpha = yToAlpha(y, this.canvas.height);
    this.points = insertSorted(this.points, { hu: HU(newHu), rgba: [1, 1, 1, newAlpha] as const });
    this.commit();
  };
}
