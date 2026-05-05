import { invariant } from '@/core/assert';
import { packF16FromInts } from '@/core/f16';
import type { Modality, Volume3D } from '@/dicom/types';
import type { GpuContext } from '@/gpu/context';
import { createTexture, type GpuTexture } from '@/gpu/resources';

export interface VolumeExtent {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}
export interface VolumeSpacing {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface VolumeMeta {
  readonly minHU: number;
  readonly maxHU: number;
  readonly modality: Modality;
}

/** Mutable handle around a r16float 3D texture. `swap()` adopts another bundle's
 *  resources, disposing the previously-held texture. Pass cache invalidation
 *  keys on `view` identity, so swap rebuilds bind groups next frame. */
export class VolumeTextureBundle {
  texture: GpuTexture;
  view: GPUTextureView;
  extent: VolumeExtent;
  minHU: number;
  maxHU: number;
  spacingMm: VolumeSpacing;
  modality: Modality;

  constructor(
    texture: GpuTexture,
    view: GPUTextureView,
    extent: VolumeExtent,
    spacingMm: VolumeSpacing,
    meta: VolumeMeta,
  ) {
    this.texture = texture;
    this.view = view;
    this.extent = extent;
    this.spacingMm = spacingMm;
    this.minHU = meta.minHU;
    this.maxHU = meta.maxHU;
    this.modality = meta.modality;
  }

  swap(next: VolumeTextureBundle): void {
    if (next === this) return;
    const old = this.texture;
    this.texture = next.texture;
    this.view = next.view;
    this.extent = next.extent;
    this.spacingMm = next.spacingMm;
    this.minHU = next.minHU;
    this.maxHU = next.maxHU;
    this.modality = next.modality;
    if (old !== this.texture) old.dispose();
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export function allocateVolumeBundle(
  ctx: GpuContext,
  extent: VolumeExtent,
  spacing: VolumeSpacing,
  meta: VolumeMeta,
  label = 'volume.r16float',
): VolumeTextureBundle {
  const max3D = ctx.caps.maxTextureDimension3D;
  invariant(extent.width <= max3D, `volume w ${extent.width} > max3D ${max3D}`);
  invariant(extent.height <= max3D, `volume h ${extent.height} > max3D ${max3D}`);
  invariant(extent.depth <= max3D, `volume d ${extent.depth} > max3D ${max3D}`);

  const tex = createTexture(ctx.device, ctx.registry, {
    label,
    size: { width: extent.width, height: extent.height, depthOrArrayLayers: extent.depth },
    format: 'r16float',
    dimension: '3d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const view = tex.texture.createView({ label: `${label}.view`, dimension: '3d' });
  return new VolumeTextureBundle(tex, view, extent, spacing, meta);
}

export function writeSlice(
  ctx: GpuContext,
  bundle: VolumeTextureBundle,
  sliceIdx: number,
  data: Int16Array | Uint16Array,
  packBuf?: Uint16Array,
): void {
  const { width, height, depth } = bundle.extent;
  invariant(sliceIdx >= 0 && sliceIdx < depth, `sliceIdx ${sliceIdx} out of [0, ${depth})`);
  invariant(data.length === width * height, `slice len ${data.length} != ${width * height}`);

  const out = packBuf ?? new Uint16Array(width * height);
  invariant(out.length === width * height, 'packBuf size mismatch');
  packF16FromInts(out, data);

  ctx.queue.writeTexture(
    { texture: bundle.texture.texture, origin: { x: 0, y: 0, z: sliceIdx } },
    out as unknown as ArrayBufferView<ArrayBuffer>,
    { offset: 0, bytesPerRow: width * 2, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 },
  );
}

export function uploadVolume(ctx: GpuContext, volume: Volume3D): VolumeTextureBundle {
  const { width, height, depth } = volume.extent;
  const bundle = allocateVolumeBundle(ctx, volume.extent, volume.spacing, {
    minHU: volume.minValue,
    maxHU: volume.maxValue,
    modality: volume.modality,
  });
  const sliceLen = width * height;
  const packBuf = new Uint16Array(sliceLen);
  const src =
    volume.data instanceof Int16Array
      ? volume.data
      : new Int16Array(volume.data.buffer, volume.data.byteOffset, volume.data.length);
  for (let z = 0; z < depth; z++) {
    writeSlice(ctx, bundle, z, src.subarray(z * sliceLen, (z + 1) * sliceLen), packBuf);
  }
  return bundle;
}
