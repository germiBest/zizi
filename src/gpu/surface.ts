import type { GpuContext } from './context';
import { Swapchain, type SwapchainOptions } from './swapchain';

export interface SurfaceOptions extends SwapchainOptions {
  readonly alphaMode?: GPUCanvasAlphaMode;
  readonly autoResize?: boolean;
}

export class Surface {
  readonly canvasCtx: GPUCanvasContext;
  readonly swapchain: Swapchain;
  readonly format: GPUTextureFormat;

  private disposed = false;

  constructor(
    readonly ctx: GpuContext,
    readonly canvas: HTMLCanvasElement,
    opts: SurfaceOptions = {},
  ) {
    this.swapchain = new Swapchain(canvas, opts);
    if (opts.autoResize !== false) this.swapchain.start();

    const cctx = canvas.getContext('webgpu');
    if (!cctx) {
      throw new Error('Surface: canvas.getContext("webgpu") returned null');
    }
    this.canvasCtx = cctx;
    this.format = ctx.format;
    this.canvasCtx.configure({
      device: ctx.device,
      format: ctx.format,
      alphaMode: opts.alphaMode ?? 'premultiplied',
    });
  }

  getCurrentTexture(): GPUTexture {
    return this.canvasCtx.getCurrentTexture();
  }

  get width(): number {
    return this.swapchain.width;
  }

  get height(): number {
    return this.swapchain.height;
  }

  get aspect(): number {
    return this.swapchain.aspect;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.swapchain.stop();
    try {
      this.canvasCtx.unconfigure();
    } catch {
      // device may be lost; ignore
    }
  }
}
