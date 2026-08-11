import type { GpuContext } from '@/gpu/context';
import { COMPUTE, bglT, createComputePipeline } from '@/gpu/pipeline';
import { createTexture, type GpuTexture } from '@/gpu/resources';
import minmaxWgsl from './shaders/minmax.wgsl?raw';
import type { VolumeExtent, VolumeTextureBundle } from './volume-upload';

export const MINMAX_CELL = 8;
const MINMAX_FORMAT: GPUTextureFormat = 'rgba16float';

export class MinMaxGrid {
  texture: GpuTexture;
  view: GPUTextureView;
  cellDims: VolumeExtent;
  private readonly bgl: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;

  constructor(
    private readonly ctx: GpuContext,
    bundle: VolumeTextureBundle,
  ) {
    this.bgl = ctx.device.createBindGroupLayout({
      label: 'minmax.bgl',
      entries: [
        bglT(0, '3d'),
        {
          binding: 1,
          visibility: COMPUTE,
          storageTexture: { access: 'write-only', format: MINMAX_FORMAT, viewDimension: '3d' },
        },
      ],
    });
    this.pipeline = createComputePipeline(ctx.device, {
      label: 'minmax.build',
      code: minmaxWgsl,
      entryPoint: 'cs_build',
      bindGroupLayouts: [this.bgl],
    });
    const r = this.allocate(bundle.extent);
    this.texture = r.texture;
    this.view = r.view;
    this.cellDims = r.dims;
  }

  private cellsFor(extent: VolumeExtent): VolumeExtent {
    return {
      width: Math.ceil(extent.width / MINMAX_CELL),
      height: Math.ceil(extent.height / MINMAX_CELL),
      depth: Math.ceil(extent.depth / MINMAX_CELL),
    };
  }

  private allocate(extent: VolumeExtent): {
    texture: GpuTexture;
    view: GPUTextureView;
    dims: VolumeExtent;
  } {
    const dims = this.cellsFor(extent);
    const texture = createTexture(this.ctx.device, this.ctx.registry, {
      label: 'minmax.grid',
      size: { width: dims.width, height: dims.height, depthOrArrayLayers: dims.depth },
      format: MINMAX_FORMAT,
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });
    const view = texture.texture.createView({ label: 'minmax.grid.view', dimension: '3d' });
    return { texture, view, dims };
  }

  rebuildFor(bundle: VolumeTextureBundle): void {
    const need = this.cellsFor(bundle.extent);
    if (
      need.width !== this.cellDims.width ||
      need.height !== this.cellDims.height ||
      need.depth !== this.cellDims.depth
    ) {
      this.texture.dispose();
      const r = this.allocate(bundle.extent);
      this.texture = r.texture;
      this.view = r.view;
      this.cellDims = r.dims;
    }
    const bg = this.ctx.device.createBindGroup({
      label: 'minmax.bg',
      layout: this.bgl,
      entries: [
        { binding: 0, resource: bundle.view },
        { binding: 1, resource: this.view },
      ],
    });
    const encoder = this.ctx.device.createCommandEncoder({ label: 'minmax.encoder' });
    const pass = encoder.beginComputePass({ label: 'minmax.pass' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(this.cellDims.width, this.cellDims.height, this.cellDims.depth);
    pass.end();
    this.ctx.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.texture.dispose();
  }
}
