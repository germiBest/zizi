import { describe, expect, it } from 'vitest';
import type { LevelManifest, PreprocessedManifestV2 } from '@/dicom/types';
import type { GpuCaps } from '@/gpu/context';
import { fitsInCaps, levelByteSize, pickMaxLevel } from '@/render/pyramid';

const STUB_CAPS = (overrides: Partial<GpuCaps> = {}): GpuCaps => ({
  hasTimestampQuery: false,
  hasFloat32Filterable: false,
  hasShaderF16: false,
  maxStorageBufferBindingSize: 1 << 30,
  maxComputeWorkgroupSizeX: 256,
  maxTextureDimension3D: 2048,
  maxBufferSize: 268_435_456,
  ...overrides,
});

const mkLevel = (level: number, w: number, h: number, d: number): LevelManifest => ({
  level,
  extent: { width: w, height: h, depth: d },
  spacingScale: {
    x: 2 ** level,
    y: 2 ** level,
    z: 2 ** level,
  },
  compression: 'none',
  raw: `level-${level}/volume.raw`,
  rawSha256: 'a'.repeat(64),
  minValue: -1024,
  maxValue: 3071,
});

const mkManifest = (levels: LevelManifest[]): PreprocessedManifestV2 => ({
  schema: 'zizi-volume/v2',
  modality: 'CT',
  spacing: { x: 0.7, y: 0.7, z: 1 },
  minValue: -1024,
  maxValue: 3071,
  dtype: 'int16',
  levels,
});

describe('levelByteSize', () => {
  it('computes 2-byte-per-voxel total for r16float storage', () => {
    expect(levelByteSize(mkLevel(0, 64, 64, 64))).toBe(64 * 64 * 64 * 2);
    expect(levelByteSize(mkLevel(0, 512, 512, 500))).toBe(512 * 512 * 500 * 2);
  });
});

describe('fitsInCaps', () => {
  it('accepts levels under both buffer and 3D dimension caps', () => {
    const caps = STUB_CAPS();
    expect(fitsInCaps(mkLevel(0, 256, 256, 200), caps)).toBe(true);
    expect(fitsInCaps(mkLevel(0, 64, 64, 64), caps)).toBe(true);
  });

  it('rejects levels exceeding maxBufferSize', () => {
    const caps = STUB_CAPS({ maxBufferSize: 1024 * 1024 }); // 1 MiB
    expect(fitsInCaps(mkLevel(0, 512, 512, 500), caps)).toBe(false);
  });

  it('rejects levels exceeding maxTextureDimension3D', () => {
    const caps = STUB_CAPS({ maxTextureDimension3D: 256 });
    expect(fitsInCaps(mkLevel(0, 512, 512, 100), caps)).toBe(false);
  });
});

describe('pickMaxLevel', () => {
  const fourLevel = mkManifest([
    mkLevel(0, 512, 512, 500),
    mkLevel(1, 256, 256, 250),
    mkLevel(2, 128, 128, 125),
    mkLevel(3, 64, 64, 62),
  ]);

  it('picks finest level (0) when all fit', () => {
    expect(pickMaxLevel(fourLevel, STUB_CAPS({ maxBufferSize: 1 << 30 }))).toBe(0);
  });

  it('skips finest if too big and picks next finest', () => {
    expect(pickMaxLevel(fourLevel, STUB_CAPS({ maxBufferSize: 200_000_000 }))).toBe(1);
  });

  it('falls back to coarsest level when nothing fits', () => {
    expect(pickMaxLevel(fourLevel, STUB_CAPS({ maxBufferSize: 1 }))).toBe(3);
  });

  it('respects capLevel debug override', () => {
    expect(pickMaxLevel(fourLevel, STUB_CAPS(), 2)).toBe(2);
    expect(pickMaxLevel(fourLevel, STUB_CAPS(), 0)).toBe(0);
  });

  it('honors capLevel when finer levels would otherwise fit', () => {
    const caps = STUB_CAPS({ maxBufferSize: 1 << 30 });
    expect(pickMaxLevel(fourLevel, caps, 2)).toBe(2);
  });
});
