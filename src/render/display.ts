import { handle } from '@/core/types';
import type { GpuContext } from '@/gpu/context';
import { createRenderPipeline } from '@/gpu/pipeline';
import type { FrameContext, Pass, ResourceUse } from './frame';
import displayWgsl from './shaders/display.wgsl?raw';

const STORAGE_IN = handle('color.storage');
const CANVAS_OUT = handle('canvas.color');

export class DisplayPass implements Pass {
  readonly name = 'display';
  readonly reads: readonly ResourceUse[] = [{ handle: STORAGE_IN, access: 'read' }];
  readonly writes: readonly ResourceUse[] = [{ handle: CANVAS_OUT, access: 'write' }];

  private readonly pipeline: GPURenderPipeline;
  private readonly bgl: GPUBindGroupLayout;
  private readonly sampler: GPUSampler;

  private cachedBindGroup: GPUBindGroup | null = null;
  private cachedView: GPUTextureView | null = null;

  constructor(private readonly ctx: GpuContext) {
    this.bgl = ctx.device.createBindGroupLayout({
      label: 'display.bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '2d' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    });

    this.pipeline = createRenderPipeline(ctx.device, {
      label: 'display.pipeline',
      code: displayWgsl,
      vertexEntry: 'vs_main',
      fragmentEntry: 'fs_main',
      bindGroupLayouts: [this.bgl],
      targetFormat: ctx.format,
      primitive: { topology: 'triangle-list' },
    });

    this.sampler = ctx.device.createSampler({
      label: 'display.sampler',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  record(encoder: GPUCommandEncoder, frame: FrameContext): void {
    if (this.cachedView !== frame.storageView) {
      this.cachedBindGroup = this.ctx.device.createBindGroup({
        label: 'display.bg',
        layout: this.bgl,
        entries: [
          { binding: 0, resource: frame.storageView },
          { binding: 1, resource: this.sampler },
        ],
      });
      this.cachedView = frame.storageView;
    }

    const pass = encoder.beginRenderPass({
      label: 'display.pass',
      colorAttachments: [
        {
          view: frame.canvasView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.cachedBindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }
}
