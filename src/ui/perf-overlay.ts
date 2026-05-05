import type { ResourceRegistry } from '@/gpu/resources';

const UPDATE_INTERVAL_MS = 100;
const DEFAULT_WINDOW = 120;

interface Row {
  readonly val: HTMLSpanElement;
}

export class PerfOverlay {
  private readonly samples: number[] = [];
  private readonly gpuSamples: number[] = [];
  private lastUpdate = 0;
  private readonly fps: Row;
  private readonly frame: Row;
  private readonly gpu: Row;
  private readonly res: Row;

  constructor(
    host: HTMLElement,
    private readonly registry?: ResourceRegistry,
    private readonly windowSize = DEFAULT_WINDOW,
  ) {
    this.fps = this.makeRow(host, 'fps');
    this.frame = this.makeRow(host, 'frame');
    this.gpu = this.makeRow(host, 'gpu');
    this.res = this.makeRow(host, 'res');
    this.render(0, Number.NaN, Number.NaN, 0, 0);
  }

  sample(frameMs: number, gpuMs: number): void {
    if (Number.isFinite(frameMs)) this.push(this.samples, frameMs);
    if (Number.isFinite(gpuMs)) this.push(this.gpuSamples, gpuMs);

    const now = performance.now();
    if (now - this.lastUpdate < UPDATE_INTERVAL_MS) return;
    this.lastUpdate = now;

    const fAvg = mean(this.samples);
    const gAvg = mean(this.gpuSamples);
    const limit = Number.isFinite(gAvg) ? Math.max(fAvg, gAvg) : fAvg;
    this.render(
      limit > 0 ? 1000 / limit : 0,
      fAvg,
      gAvg,
      this.registry?.count() ?? 0,
      this.registry?.totalBytes() ?? 0,
    );
  }

  private push(arr: number[], v: number): void {
    arr.push(v);
    if (arr.length > this.windowSize) arr.shift();
  }

  private render(
    fps: number,
    frameMs: number,
    gpuMs: number,
    resources: number,
    bytes: number,
  ): void {
    this.fps.val.textContent = f(fps, 0);
    this.frame.val.textContent = `${f(frameMs, 2)} ms`;
    this.gpu.val.textContent = `${f(gpuMs, 2)} ms`;
    this.res.val.textContent = `${resources} · ${mib(bytes)}`;
  }

  private makeRow(host: HTMLElement, label: string): Row {
    const lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'val';
    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(lbl);
    row.appendChild(val);
    host.appendChild(row);
    return { val };
  }
}

const f = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const mib = (b: number) => (Number.isFinite(b) && b > 0 ? `${(b / 1048576).toFixed(1)} MiB` : '—');

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
