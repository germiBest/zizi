import { handle } from '@/core/types';
import type { GpuContext } from '@/gpu/context';
import { bglS, bglSO, bglT, bglU, createComputePipeline } from '@/gpu/pipeline';
import { createBuffer, type GpuBuffer } from '@/gpu/resources';
import { composeShader } from '@/gpu/shader';
import type { AppState, SlabReduce } from '@/state/app-state';
import type { FrameContext, Pass, ResourceUse } from './frame';
import mprWgsl from './shaders/mpr.wgsl?raw';
import utilsWgsl from './shaders/utils.wgsl?raw';
import type { TransferFnTexture } from './transfer-fn';
import type { VolumeTextureBundle } from './volume-upload';

export type MprPlane = 'axial' | 'sagittal' | 'coronal';

const PLANE_TO_ID: Record<MprPlane, number> = { axial: 0, sagittal: 1, coronal: 2 };
const REDUCE_TO_ID: Record<SlabReduce, number> = { min: 0, max: 1, avg: 2 };

const UNIFORM_FLOATS = 12;
const STORAGE_OUT = handle('color.storage');
const VOLUME_IN = handle('volume.r16float');
const TF_IN = handle('tf.lut');

export class MprPass implements Pass {
  readonly name: string;
  readonly reads: readonly ResourceUse[] = [
    { handle: VOLUME_IN, access: 'read' },
    { handle: TF_IN, access: 'read' },
  ];
  readonly writes: readonly ResourceUse[] = [{ handle: STORAGE_OUT, access: 'write' }];

  private readonly pipeline: GPUComputePipeline;
  private readonly bgl: GPUBindGroupLayout;
  private readonly uniformBuf: GpuBuffer;
  private readonly u = new Float32Array(UNIFORM_FLOATS);
  private bg: GPUBindGroup | null = null;
  private cView: GPUTextureView | null = null;
  private cVol: GPUTextureView | null = null;

  constructor(
    private readonly ctx: GpuContext,
    private readonly volume: VolumeTextureBundle,
    private readonly plane: MprPlane,
    private readonly state: AppState,
    private readonly tfTex: TransferFnTexture,
  ) {
    this.name = `mpr-${plane}`;
    this.bgl = ctx.device.createBindGroupLayout({
      label: `${this.name}.bgl`,
      entries: [bglU(0), bglT(1, '3d'), bglT(2, '2d'), bglS(3), bglSO(4)],
    });
    this.pipeline = createComputePipeline(ctx.device, {
      label: `${this.name}.compute`,
      code: composeShader(utilsWgsl, mprWgsl),
      entryPoint: 'cs_main',
      bindGroupLayouts: [this.bgl],
    });
    this.uniformBuf = createBuffer(ctx.device, ctx.registry, {
      label: `${this.name}.uniforms`,
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  record(encoder: GPUCommandEncoder, frame: FrameContext): void {
    this.updateUniforms();
    this.ctx.queue.writeBuffer(this.uniformBuf.buffer, 0, this.u);

    if (this.cView !== frame.storageView || this.cVol !== this.volume.view) {
      this.bg = this.ctx.device.createBindGroup({
        label: `${this.name}.bg`,
        layout: this.bgl,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuf.buffer } },
          { binding: 1, resource: this.volume.view },
          { binding: 2, resource: this.tfTex.view },
          { binding: 3, resource: this.tfTex.sampler },
          { binding: 4, resource: frame.storageView },
        ],
      });
      this.cView = frame.storageView;
      this.cVol = this.volume.view;
    }

    const writes = frame.timestampWrites(this.name);
    const pass = encoder.beginComputePass({
      label: `${this.name}.pass`,
      ...(writes ? { timestampWrites: writes } : {}),
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bg);
    pass.dispatchWorkgroups(Math.ceil(frame.width / 8), Math.ceil(frame.height / 8), 1);
    pass.end();
  }

  destroy(): void {
    this.uniformBuf.dispose();
  }

  private updateUniforms(): void {
    const u = this.u;
    const s = this.state;
    const ext = this.volume.extent;
    const slice =
      this.plane === 'axial' ? s.axial : this.plane === 'sagittal' ? s.sagittal : s.coronal;

    u[0] = PLANE_TO_ID[this.plane];
    u[1] = Math.max(0, Math.min(1, slice));
    u[2] = s.slabSlices;
    u[3] = REDUCE_TO_ID[s.slabReduce];
    u[4] = ext.width;
    u[5] = ext.height;
    u[6] = ext.depth;
    u[7] = 0;
    u[8] = s.wl.center as number;
    u[9] = s.wl.width as number;
    u[10] = 0;
    u[11] = 0;
  }
}

export function reduceSlab(samples: readonly number[], reduce: SlabReduce): number {
  if (samples.length === 0) return Number.NaN;
  if (reduce === 'min') return samples.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
  if (reduce === 'max') return samples.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}
