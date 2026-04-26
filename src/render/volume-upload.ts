import { invariant } from '@/core/assert';
import type { Volume3D } from '@/dicom/types';
import type { GpuContext } from '@/gpu/context';
import { createTexture, type GpuTexture } from '@/gpu/resources';

export interface VolumeTextureBundle {
  readonly texture: GpuTexture;
  readonly view: GPUTextureView;
  readonly extent: { readonly width: number; readonly height: number; readonly depth: number };
  readonly minHU: number;
  readonly maxHU: number;
  readonly spacingMm: { readonly x: number; readonly y: number; readonly z: number };
}

export function uploadVolume(ctx: GpuContext, volume: Volume3D): VolumeTextureBundle {
  const { width, height, depth } = volume.extent;
  const max3D = ctx.caps.maxTextureDimension3D;
  invariant(width <= max3D, `volume width ${width} exceeds maxTextureDimension3D ${max3D}`);
  invariant(height <= max3D, `volume height ${height} exceeds maxTextureDimension3D ${max3D}`);
  invariant(depth <= max3D, `volume depth ${depth} exceeds maxTextureDimension3D ${max3D}`);

  const tex = createTexture(ctx.device, ctx.registry, {
    label: 'volume.r32float',
    size: { width, height, depthOrArrayLayers: depth },
    format: 'r32float',
    dimension: '3d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  const float = new Float32Array(width * height * depth);
  for (let i = 0; i < float.length; i++) float[i] = volume.data[i] ?? 0;

  ctx.queue.writeTexture(
    { texture: tex.texture },
    float.buffer,
    {
      offset: 0,
      bytesPerRow: width * 4,
      rowsPerImage: height,
    },
    { width, height, depthOrArrayLayers: depth },
  );

  const view = tex.texture.createView({ label: 'volume.view', dimension: '3d' });

  return {
    texture: tex,
    view,
    extent: { width, height, depth },
    minHU: volume.minValue,
    maxHU: volume.maxValue,
    spacingMm: volume.spacing,
  };
}
