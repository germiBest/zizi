import type { ResourceRegistry } from '@/gpu/resources';

const UPDATE_INTERVAL_MS = 100;
const DEFAULT_WINDOW = 120;

interface RenderData {
  fps: number;
  frameMs: number;
  gpuMs: number;
  resources: number;
  bytes: number;
}

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
    this.render({ fps: 0, frameMs: Number.NaN, gpuMs: Number.NaN, resources: 0, bytes: 0 });
  }

  sample(frameMs: number, gpuMs: number): void {
    if (Number.isFinite(frameMs)) {
      this.samples.push(frameMs);
      if (this.samples.length > this.windowSize) this.samples.shift();
    }
    if (Number.isFinite(gpuMs)) {
      this.gpuSamples.push(gpuMs);
      if (this.gpuSamples.length > this.windowSize) this.gpuSamples.shift();
    }

    const now = performance.now();
    if (now - this.lastUpdate < UPDATE_INTERVAL_MS) return;
    this.lastUpdate = now;

    const frameMsAvg = mean(this.samples);
    const gpuMsAvg = mean(this.gpuSamples);
    const fps = frameMsAvg > 0 ? 1000 / frameMsAvg : 0;
    const resources = this.registry?.count() ?? 0;
    const bytes = this.registry?.totalBytes() ?? 0;

    this.render({ fps, frameMs: frameMsAvg, gpuMs: gpuMsAvg, resources, bytes });
  }

  private render(d: RenderData): void {
    this.fps.val.textContent = f(d.fps, 0);
    this.frame.val.textContent = `${f(d.frameMs, 2)} ms`;
    this.gpu.val.textContent = `${f(d.gpuMs, 2)} ms`;
    this.res.val.textContent = `${d.resources} · ${mib(d.bytes)}`;
  }

  private makeRow(host: HTMLElement, label: string): Row {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'val';
    row.appendChild(lbl);
    row.appendChild(val);
    host.appendChild(row);
    return { val };
  }
}

function f(n: number, digits: number): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function mib(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}
