import type { Extent3D, Spacing3D } from '@/core/types';

export type Modality = 'CT' | 'MR' | 'PT' | 'OTHER';
export type VolumeDType = 'int16' | 'uint16';
export type CompressionKind = 'none' | 'htj2k';

export interface Volume3D {
  readonly extent: Extent3D;
  readonly spacing: Spacing3D;
  readonly modality: Modality;
  readonly dtype: VolumeDType;
  readonly data: Int16Array | Uint16Array;
  readonly minValue: number;
  readonly maxValue: number;
}

export interface SliceRef {
  readonly file: string;
  readonly sha256: string;
  readonly byteLength: number;
}

interface ManifestBase {
  readonly extent: Extent3D;
  readonly spacing: Spacing3D;
  readonly modality: Modality;
  readonly dtype: VolumeDType;
  readonly minValue: number;
  readonly maxValue: number;
}

export interface PreprocessedManifestV1Raw extends ManifestBase {
  readonly schema: 'zizi-volume/v1';
  readonly rawSha256: string;
  readonly raw: string;
  readonly compression?: 'none';
}

export interface PreprocessedManifestV1Htj2k extends ManifestBase {
  readonly schema: 'zizi-volume/v1';
  readonly compression: 'htj2k';
  readonly slices: readonly SliceRef[];
  readonly dataOffset?: number;
}

export type PreprocessedManifestV1 = PreprocessedManifestV1Raw | PreprocessedManifestV1Htj2k;

export interface LevelManifest {
  readonly level: number;
  readonly extent: Extent3D;
  readonly spacingScale: { readonly x: number; readonly y: number; readonly z: number };
  readonly compression: CompressionKind;
  readonly slices?: readonly SliceRef[];
  readonly raw?: string;
  readonly rawSha256?: string;
  readonly minValue: number;
  readonly maxValue: number;
  readonly dataOffset?: number;
}

export interface PreprocessedManifestV2 {
  readonly schema: 'zizi-volume/v2';
  readonly modality: Modality;
  readonly spacing: Spacing3D;
  readonly minValue: number;
  readonly maxValue: number;
  readonly dtype: VolumeDType;
  readonly levels: readonly LevelManifest[];
}

export type PreprocessedManifest = PreprocessedManifestV1 | PreprocessedManifestV2;

export const isV1Manifest = (m: PreprocessedManifest): m is PreprocessedManifestV1 =>
  m.schema === 'zizi-volume/v1';
export const isV2Manifest = (m: PreprocessedManifest): m is PreprocessedManifestV2 =>
  m.schema === 'zizi-volume/v2';
export const isV1Htj2k = (m: PreprocessedManifestV1): m is PreprocessedManifestV1Htj2k =>
  m.compression === 'htj2k';
