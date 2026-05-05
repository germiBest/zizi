import type { GpuContext } from '@/gpu/context';
import { createTexture, type GpuTexture } from '@/gpu/resources';
import type { Surface } from '@/gpu/surface';
import { Timestamps } from '@/gpu/timestamps';
import type { CameraSnapshot, FrameContext, Pass } from './frame';

export class Renderer {
  readonly timestamps: Timestamps;
  private storageTex: GpuTexture | null = null;
  private storageView: GPUTextureView | null = null;
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private disposed = false;
  private finalized = false;

  lastFrameMs = Number.NaN;
  ttfpMs: number | null = null;

  constructor(
    readonly ctx: GpuContext,
    readonly surface: Surface,
    readonly passes: Pass[],
  ) {
    this.timestamps = new Timestamps(ctx.device, ctx.caps.hasTimestampQuery);
    for (const p of passes) this.timestamps.add(p.name);
  }

  get lastGpuMs(): number {
    return this.timestamps.totalMs();
  }

  tick(dt: number, snapshot: CameraSnapshot): void {
    if (this.disposed || !this.ctx.registry.isAlive) return;
    if (!this.finalized) {
      this.timestamps.finalize();
      this.finalized = true;
    }
    const t0 = performance.now();
    this.time += dt;

    const w = this.surface.width;
    const h = this.surface.height;
    if (w !== this.lastW || h !== this.lastH || !this.storageView) this.recreateStorage(w, h);

    const canvasView = this.surface.getCurrentTexture().createView({ label: 'frame.canvasView' });
    const frame: FrameContext = {
      time: this.time,
      dt,
      width: w,
      height: h,
      storageView: this.storageView!,
      canvasView,
      camera: snapshot,
      timestampWrites: (name) => this.timestamps.computePassWrites(name),
    };

    if (__DEV__) {
      this.ctx.device.pushErrorScope('validation');
      this.ctx.device.pushErrorScope('out-of-memory');
    }
    const encoder = this.ctx.device.createCommandEncoder({ label: 'frame.encoder' });
    for (const pass of this.passes) pass.record(encoder, frame);
    this.timestamps.resolve(encoder);
    this.ctx.queue.submit([encoder.finish()]);
    if (__DEV__) {
      void this.ctx.device.popErrorScope().then((oom) => {
        if (oom) console.error('[renderer.tick] OOM:', oom.message);
      });
      void this.ctx.device.popErrorScope().then((val) => {
        if (val) console.error('[renderer.tick] validation:', val.message);
      });
    }
    this.timestamps.pollReadback();
    this.lastFrameMs = performance.now() - t0;
    if (this.ttfpMs === null) this.ttfpMs = performance.now();
  }

  async waitIdle(): Promise<void> {
    await this.ctx.queue.onSubmittedWorkDone();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.storageTex?.dispose();
    this.storageTex = null;
    this.storageView = null;
    this.timestamps.destroy();
    for (const p of this.passes) p.destroy?.();
  }

  private recreateStorage(w: number, h: number): void {
    this.storageTex?.dispose();
    this.storageTex = createTexture(this.ctx.device, this.ctx.registry, {
      label: 'render.storage',
      size: { width: w, height: h, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.storageView = this.storageTex.texture.createView({ label: 'render.storage.view' });
    this.lastW = w;
    this.lastH = h;
  }
}
