import { Emitter } from '@/core/events';
import { ResourceRegistry } from './resources';

export interface GpuCaps {
  readonly hasTimestampQuery: boolean;
  readonly hasFloat32Filterable: boolean;
  readonly hasShaderF16: boolean;
  readonly maxStorageBufferBindingSize: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxTextureDimension3D: number;
  readonly maxBufferSize: number;
}

export type GpuEventMap = {
  'device-lost': { reason: GPUDeviceLostReason; message: string };
};

export interface GpuContextInit {
  readonly powerPreference?: GPUPowerPreference;
  readonly extraFeatures?: readonly GPUFeatureName[];
}

const OPTIONAL_FEATURES: readonly GPUFeatureName[] = [
  'timestamp-query',
  'float32-filterable',
  'shader-f16',
];

export class GpuContext {
  readonly events = new Emitter<GpuEventMap>();
  readonly registry = new ResourceRegistry();

  private constructor(
    readonly adapter: GPUAdapter,
    readonly adapterInfo: GPUAdapterInfo,
    readonly device: GPUDevice,
    readonly queue: GPUQueue,
    readonly format: GPUTextureFormat,
    readonly caps: GpuCaps,
  ) {
    void this.device.lost.then((info) => {
      this.registry.invalidate();
      this.events.emit('device-lost', { reason: info.reason, message: info.message });
      if (__DEV__) console.warn('[zizi/gpu] device lost:', info.reason, info.message);
    });
  }

  static async create(init: GpuContextInit = {}): Promise<GpuContext> {
    if (!('gpu' in navigator) || !navigator.gpu)
      throw new Error('WebGPU is unavailable: navigator.gpu is undefined');

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: init.powerPreference ?? 'high-performance',
    });
    if (!adapter) throw new Error('WebGPU: no adapter available');

    const info = adapter.info;
    const required: GPUFeatureName[] = [];
    for (const f of OPTIONAL_FEATURES) if (adapter.features.has(f)) required.push(f);
    for (const f of init.extraFeatures ?? [])
      if (adapter.features.has(f) && !required.includes(f)) required.push(f);

    const device = await adapter.requestDevice({
      label: 'zizi.device',
      requiredFeatures: required,
    });
    const format = navigator.gpu.getPreferredCanvasFormat();
    const caps: GpuCaps = {
      hasTimestampQuery: device.features.has('timestamp-query'),
      hasFloat32Filterable: device.features.has('float32-filterable'),
      hasShaderF16: device.features.has('shader-f16'),
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxTextureDimension3D: device.limits.maxTextureDimension3D,
      maxBufferSize: device.limits.maxBufferSize,
    };

    if (__DEV__) {
      console.info('[zizi/gpu] adapter', {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      });
      console.info('[zizi/gpu] caps', caps);
      console.info('[zizi/gpu] features', required);
    }
    return new GpuContext(adapter, info, device, device.queue, format, caps);
  }
}
