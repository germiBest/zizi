import { mat4 } from 'wgpu-matrix';
import type { OrbitCamera } from '@/camera/orbit';
import { perspective } from '@/camera/projection';
import { handle } from '@/core/types';
import type { GpuContext } from '@/gpu/context';
import { createComputePipeline } from '@/gpu/pipeline';
import { createBuffer, type GpuBuffer } from '@/gpu/resources';
import { composeShader } from '@/gpu/shader';
import type { FrameContext, Pass, ResourceUse } from './frame';
import raycastWgsl from './shaders/raycast.wgsl?raw';
import utilsWgsl from './shaders/utils.wgsl?raw';
import type { VolumeTextureBundle } from './volume-upload';

const STEP_COUNT = 256;
const FOV_Y = (60 * Math.PI) / 180;
const NEAR = 0.1;
const FAR = 100;

const STORAGE_OUT = handle('color.storage');

const UNIFORM_FLOATS = 32;
const UNIFORM_BYTES = UNIFORM_FLOATS * 4;

export class RaycastPass implements Pass {
  readonly name = 'raycast';
  readonly reads: readonly ResourceUse[] = [];
  readonly writes: readonly ResourceUse[] = [{ handle: STORAGE_OUT, access: 'write' }];

  private readonly pipeline: GPUComputePipeline;
  private readonly bgl: GPUBindGroupLayout;
  private readonly uniformBuf: GpuBuffer;
  private readonly uniformData = new Float32Array(UNIFORM_FLOATS);
  private readonly proj = new Float32Array(16);
  private readonly vp = new Float32Array(16);
  private readonly invViewProj = new Float32Array(16);
  private readonly camPos = new Float32Array(3);

  private cachedBindGroup: GPUBindGroup | null = null;
  private cachedView: GPUTextureView | null = null;

  constructor(
    private readonly ctx: GpuContext,
    private readonly volume: VolumeTextureBundle,
    private readonly camera: OrbitCamera,
  ) {
    this.bgl = ctx.device.createBindGroupLayout({
      label: 'raycast.bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'unfilterable-float', viewDimension: '3d' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'rgba8unorm',
            viewDimension: '2d',
          },
        },
      ],
    });

    this.pipeline = createComputePipeline(ctx.device, {
      label: 'raycast.compute',
      code: composeShader(utilsWgsl, raycastWgsl),
      entryPoint: 'cs_main',
      bindGroupLayouts: [this.bgl],
    });

    this.uniformBuf = createBuffer(ctx.device, ctx.registry, {
      label: 'raycast.uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  record(encoder: GPUCommandEncoder, frame: FrameContext): void {
    this.updateUniforms(frame);
    this.ctx.queue.writeBuffer(this.uniformBuf.buffer, 0, this.uniformData);

    if (this.cachedView !== frame.storageView) {
      this.cachedBindGroup = this.makeBindGroup(frame.storageView);
      this.cachedView = frame.storageView;
    }

    const pass = encoder.beginComputePass({ label: 'raycast.pass' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.cachedBindGroup);
    const wgX = Math.ceil(frame.width / 8);
    const wgY = Math.ceil(frame.height / 8);
    pass.dispatchWorkgroups(wgX, wgY, 1);
    pass.end();
  }

  destroy(): void {
    this.uniformBuf.dispose();
  }

  private makeBindGroup(storageView: GPUTextureView): GPUBindGroup {
    return this.ctx.device.createBindGroup({
      label: 'raycast.bg',
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf.buffer } },
        { binding: 1, resource: this.volume.view },
        { binding: 2, resource: storageView },
      ],
    });
  }

  private updateUniforms(frame: FrameContext): void {
    const aspect = frame.width / Math.max(1, frame.height);
    perspective(FOV_Y, aspect, NEAR, FAR, this.proj);
    const view = this.camera.view();
    mat4.multiply(this.proj, view, this.vp);
    mat4.invert(this.vp, this.invViewProj);

    const u = this.uniformData;
    u.set(this.invViewProj, 0);

    this.camera.position(this.camPos);
    u[16] = this.camPos[0]!;
    u[17] = this.camPos[1]!;
    u[18] = this.camPos[2]!;
    u[19] = 0;

    u[20] = -0.5;
    u[21] = -0.5;
    u[22] = -0.5;
    u[23] = 0;

    u[24] = 0.5;
    u[25] = 0.5;
    u[26] = 0.5;
    u[27] = 0;

    u[28] = STEP_COUNT;
    u[29] = this.volume.minHU;
    u[30] = this.volume.maxHU;
    u[31] = 0;
  }
}
