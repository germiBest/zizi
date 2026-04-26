export interface SwapchainOptions {
  readonly maxDpr?: number;
}

export class Swapchain {
  private observer: ResizeObserver | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: SwapchainOptions = {},
  ) {
    this.applySize();
  }

  start(): void {
    if (this.observer) return;
    this.observer = new ResizeObserver(() => this.applySize());
    this.observer.observe(this.canvas);
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private applySize(): void {
    const cap = this.opts.maxDpr ?? 2;
    const dpr = Math.min(globalThis.devicePixelRatio ?? 1, cap);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  get aspect(): number {
    return this.canvas.height === 0 ? 1 : this.canvas.width / this.canvas.height;
  }
}
