import { mat4 } from 'wgpu-matrix';
import { perspective } from '@/camera/projection';
import { handle } from '@/core/types';
import type { GpuContext } from '@/gpu/context';
import { bglS, bglSO, bglT, bglU, createComputePipeline } from '@/gpu/pipeline';
import { createBuffer, type GpuBuffer } from '@/gpu/resources';
import { composeShader } from '@/gpu/shader';
import { type AppState, RENDER_MODE_TO_ID } from '@/state/app-state';
import type { FrameContext, Pass, ResourceUse } from './frame';
import raycastWgsl from './shaders/raycast.wgsl?raw';
import utilsWgsl from './shaders/utils.wgsl?raw';
import type { TransferFnTexture } from './transfer-fn';
import type { VolumeTextureBundle } from './volume-upload';

const STEP_COUNT_DVR = 384;
const STEP_COUNT_PROJ = 256;
const DENSITY = 1.0;
const ALPHA_MAX = 0.99;
const FOV_Y = (60 * Math.PI) / 180;
const NEAR = 0.1;
const FAR = 100;
const UNIFORM_FLOATS = 40;

const STORAGE_OUT = handle('color.storage');
const VOLUME_IN = handle('volume.r16float');
const TF_IN = handle('tf.lut');

export class RaycastPass implements Pass {
  readonly name = 'raycast';
  readonly reads: readonly ResourceUse[] = [
    { handle: VOLUME_IN, access: 'read' },
    { handle: TF_IN, access: 'read' },
  ];
  readonly writes: readonly ResourceUse[] = [{ handle: STORAGE_OUT, access: 'write' }];

  private readonly pipeline: GPUComputePipeline;
  private readonly bgl: GPUBindGroupLayout;
  private readonly uniformBuf: GpuBuffer;
  private readonly u = new Float32Array(UNIFORM_FLOATS);
  private readonly proj = new Float32Array(16);
  private readonly vp = new Float32Array(16);
  private readonly invVp = new Float32Array(16);
  private bg: GPUBindGroup | null = null;
  private cView: GPUTextureView | null = null;
  private cTf: GPUTextureView | null = null;
  private cVol: GPUTextureView | null = null;

  constructor(
    private readonly ctx: GpuContext,
    private readonly volume: VolumeTextureBundle,
    private readonly state: AppState,
    private readonly tfTex: TransferFnTexture,
  ) {
    this.bgl = ctx.device.createBindGroupLayout({
      label: 'raycast.bgl',
      entries: [bglU(0), bglT(1, '3d'), bglT(2, '2d'), bglS(3), bglSO(4)],
    });
    this.pipeline = createComputePipeline(ctx.device, {
      label: 'raycast.compute',
      code: composeShader(utilsWgsl, raycastWgsl),
      entryPoint: 'cs_main',
      bindGroupLayouts: [this.bgl],
    });
    this.uniformBuf = createBuffer(ctx.device, ctx.registry, {
      label: 'raycast.uniforms',
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  record(encoder: GPUCommandEncoder, frame: FrameContext): void {
    this.updateUniforms(frame);
    this.ctx.queue.writeBuffer(this.uniformBuf.buffer, 0, this.u);

    if (
      this.cView !== frame.storageView ||
      this.cTf !== this.tfTex.view ||
      this.cVol !== this.volume.view
    ) {
      this.bg = this.ctx.device.createBindGroup({
        label: 'raycast.bg',
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
      this.cTf = this.tfTex.view;
      this.cVol = this.volume.view;
    }

    const writes = frame.timestampWrites(this.name);
    const pass = encoder.beginComputePass({
      label: 'raycast.pass',
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

  private updateUniforms(frame: FrameContext): void {
    const u = this.u;
    perspective(FOV_Y, frame.width / Math.max(1, frame.height), NEAR, FAR, this.proj);
    mat4.multiply(this.proj, frame.camera.view, this.vp);
    mat4.invert(this.vp, this.invVp);
    u.set(this.invVp, 0);

    const p = frame.camera.position;
    u[16] = p[0]!;
    u[17] = p[1]!;
    u[18] = p[2]!;
    u[19] = 0;

    const { width: w, height: h, depth: d } = this.volume.extent;
    const sp = this.volume.spacingMm;
    const px = w * sp.x,
      py = h * sp.y,
      pz = d * sp.z;
    const m = Math.max(px, py, pz, 1);
    const hx = (px / m) * 0.5,
      hy = (py / m) * 0.5,
      hz = (pz / m) * 0.5;
    u[20] = -hx;
    u[21] = -hy;
    u[22] = -hz;
    u[23] = 0;
    u[24] = hx;
    u[25] = hy;
    u[26] = hz;
    u[27] = 0;

    const mode = this.state.renderMode;
    u[28] = mode === 'dvr' ? STEP_COUNT_DVR : STEP_COUNT_PROJ;
    u[29] = DENSITY;
    u[30] = 1 / Math.max(w, h, d);
    u[31] = ALPHA_MAX;

    const center = this.state.wl.center as number;
    const widthRaw = this.state.wl.width as number;
    const widthSafe = Math.max(widthRaw, 1);
    const lowVisible = center - widthRaw * 0.5;
    const upperVisible = center + widthRaw * 0.5;
    u[32] = lowVisible;
    u[33] = 1 / widthSafe;
    u[34] = upperVisible;
    u[35] = lowVisible;

    u[36] = RENDER_MODE_TO_ID[mode];
    u[37] = this.state.gradientShading && mode === 'dvr' ? 1 : 0;
    u[38] = 0;
    u[39] = 0;
  }
}
