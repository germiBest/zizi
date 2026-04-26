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
  readonly canvas: HTMLCanvasElement;
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
    readonly canvas: HTMLCanvasElement,
    readonly canvasCtx: GPUCanvasContext,
    readonly format: GPUTextureFormat,
    readonly caps: GpuCaps,
  ) {
    void this.device.lost.then((info) => {
      this.registry.invalidate();
      this.events.emit('device-lost', {
        reason: info.reason,
        message: info.message,
      });
      if (__DEV__) {
        console.warn('[zizi/gpu] device lost:', info.reason, info.message);
      }
    });
  }

  static async create(init: GpuContextInit): Promise<GpuContext> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      throw new Error('WebGPU is unavailable: navigator.gpu is undefined');
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: init.powerPreference ?? 'high-performance',
    });
    if (!adapter) {
      throw new Error('WebGPU: no adapter available');
    }

    const adapterInfo = adapter.info;

    const requiredFeatures: GPUFeatureName[] = [];
    for (const f of OPTIONAL_FEATURES) {
      if (adapter.features.has(f)) requiredFeatures.push(f);
    }
    for (const f of init.extraFeatures ?? []) {
      if (adapter.features.has(f) && !requiredFeatures.includes(f)) requiredFeatures.push(f);
    }

    const device = await adapter.requestDevice({
      label: 'zizi.device',
      requiredFeatures,
    });

    const canvasCtx = init.canvas.getContext('webgpu');
    if (!canvasCtx) {
      throw new Error('WebGPU: canvas.getContext("webgpu") returned null');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    canvasCtx.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

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
        vendor: adapterInfo.vendor,
        architecture: adapterInfo.architecture,
        device: adapterInfo.device,
        description: adapterInfo.description,
      });
      console.info('[zizi/gpu] caps', caps);
      console.info('[zizi/gpu] features', requiredFeatures);
    }

    return new GpuContext(
      adapter,
      adapterInfo,
      device,
      device.queue,
      init.canvas,
      canvasCtx,
      format,
      caps,
    );
  }
}
