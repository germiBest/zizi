import type { GpuContext } from '@/gpu/context';
import { createTexture, type GpuTexture } from '@/gpu/resources';
import type { Swapchain } from '@/gpu/swapchain';
import { Timestamps } from '@/gpu/timestamps';
import type { FrameContext, Pass } from './frame';

export class Renderer {
  readonly timestamps: Timestamps;

  private storageTex: GpuTexture | null = null;
  private storageView: GPUTextureView | null = null;
  private lastW = 0;
  private lastH = 0;
  private time = 0;
  private disposed = false;

  lastFrameMs = Number.NaN;
  lastGpuMs = Number.NaN;

  constructor(
    readonly ctx: GpuContext,
    readonly swapchain: Swapchain,
    readonly passes: Pass[],
  ) {
    this.timestamps = new Timestamps(ctx.device, ctx.caps.hasTimestampQuery);
  }

  tick(dt: number): void {
    if (this.disposed) return;
    if (!this.ctx.registry.isAlive) return;
    const t0 = performance.now();
    this.time += dt;

    const w = this.swapchain.width;
    const h = this.swapchain.height;
    if (w !== this.lastW || h !== this.lastH || !this.storageView) {
      this.recreateStorage(w, h);
    }

    const canvasTex = this.ctx.canvasCtx.getCurrentTexture();
    const canvasView = canvasTex.createView({ label: 'frame.canvasView' });

    const frame: FrameContext = {
      time: this.time,
      dt,
      width: w,
      height: h,
      storageView: this.storageView!,
      canvasView,
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
    this.lastGpuMs = this.timestamps.lastMs;
    this.lastFrameMs = performance.now() - t0;
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
