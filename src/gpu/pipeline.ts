export const COMPUTE = 0x4 satisfies GPUShaderStageFlags;
export const FRAGMENT = 0x2 satisfies GPUShaderStageFlags;

export const bglU = (binding: number, vis = COMPUTE): GPUBindGroupLayoutEntry => ({
  binding,
  visibility: vis,
  buffer: { type: 'uniform' },
});
export const bglT = (
  binding: number,
  viewDimension: GPUTextureViewDimension = '2d',
  vis = COMPUTE,
  sampleType: GPUTextureSampleType = 'float',
): GPUBindGroupLayoutEntry => ({
  binding,
  visibility: vis,
  texture: { sampleType, viewDimension },
});
export const bglS = (
  binding: number,
  vis = COMPUTE,
  type: GPUSamplerBindingType = 'filtering',
): GPUBindGroupLayoutEntry => ({ binding, visibility: vis, sampler: { type } });
export const bglSO = (
  binding: number,
  format: GPUTextureFormat = 'rgba8unorm',
  vis = COMPUTE,
): GPUBindGroupLayoutEntry => ({
  binding,
  visibility: vis,
  storageTexture: { access: 'write-only', format, viewDimension: '2d' },
});

export interface ComputePipelineSpec {
  readonly label: string;
  readonly code: string;
  readonly entryPoint?: string;
  readonly bindGroupLayouts: GPUBindGroupLayout[];
  readonly constants?: Record<string, number>;
}

export function createComputePipeline(
  device: GPUDevice,
  spec: ComputePipelineSpec,
): GPUComputePipeline {
  const module = device.createShaderModule({
    label: `${spec.label}.module`,
    code: spec.code,
  });
  const layout = device.createPipelineLayout({
    label: `${spec.label}.layout`,
    bindGroupLayouts: spec.bindGroupLayouts,
  });
  return device.createComputePipeline({
    label: spec.label,
    layout,
    compute: {
      module,
      ...(spec.entryPoint ? { entryPoint: spec.entryPoint } : {}),
      ...(spec.constants ? { constants: spec.constants } : {}),
    },
  });
}

export interface RenderPipelineSpec {
  readonly label: string;
  readonly code: string;
  readonly vertexEntry?: string;
  readonly fragmentEntry?: string;
  readonly bindGroupLayouts: GPUBindGroupLayout[];
  readonly targetFormat: GPUTextureFormat;
  readonly primitive?: GPUPrimitiveState;
}

export function createRenderPipeline(
  device: GPUDevice,
  spec: RenderPipelineSpec,
): GPURenderPipeline {
  const module = device.createShaderModule({
    label: `${spec.label}.module`,
    code: spec.code,
  });
  const layout = device.createPipelineLayout({
    label: `${spec.label}.layout`,
    bindGroupLayouts: spec.bindGroupLayouts,
  });
  return device.createRenderPipeline({
    label: spec.label,
    layout,
    vertex: {
      module,
      ...(spec.vertexEntry ? { entryPoint: spec.vertexEntry } : {}),
    },
    fragment: {
      module,
      ...(spec.fragmentEntry ? { entryPoint: spec.fragmentEntry } : {}),
      targets: [{ format: spec.targetFormat }],
    },
    primitive: spec.primitive ?? { topology: 'triangle-list' },
  });
}
