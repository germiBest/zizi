import type { LevelManifest, PreprocessedManifestV2 } from '@/dicom/types';
import type { GpuCaps } from '@/gpu/context';

/**
 * Pick the finest level (lowest `level` index in `manifest.levels`) whose r16float
 * texture fits in the device's `maxBufferSize` cap. Falls back to the coarsest level
 * when even that's too big (which would be unusual but defensive).
 *
 * `capLevel` is a debug override: if set, the loader will never go finer than it.
 * Pass via `?capLevel=N` URL param when comparing competitor harnesses or stress-testing
 * memory-constrained adapters.
 */
export function pickMaxLevel(
  manifest: PreprocessedManifestV2,
  caps: GpuCaps,
  capLevel?: number,
): number {
  const cap = capLevel ?? -1;
  for (let i = 0; i < manifest.levels.length; i++) {
    if (cap >= 0 && i < cap) continue;
    const lvl = manifest.levels[i]!;
    if (fitsInCaps(lvl, caps)) return i;
  }
  return manifest.levels.length - 1;
}

export function fitsInCaps(level: LevelManifest, caps: GpuCaps): boolean {
  const { width, height, depth } = level.extent;
  if (width > caps.maxTextureDimension3D) return false;
  if (height > caps.maxTextureDimension3D) return false;
  if (depth > caps.maxTextureDimension3D) return false;
  const bytes = width * height * depth * 2;
  return bytes <= caps.maxBufferSize;
}

export function levelByteSize(level: LevelManifest): number {
  return level.extent.width * level.extent.height * level.extent.depth * 2;
}

/**
 * Iterate levels coarsest → finest, stopping at `maxLevel` (inclusive of maxLevel).
 * Convenience wrapper for the loader.
 */
export function* iterCoarsestFirst(
  manifest: PreprocessedManifestV2,
  maxLevel: number,
): Generator<LevelManifest> {
  for (let i = manifest.levels.length - 1; i >= maxLevel; i--) {
    yield manifest.levels[i]!;
  }
}
