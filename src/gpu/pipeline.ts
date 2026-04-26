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
