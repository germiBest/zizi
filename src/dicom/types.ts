import type { Extent3D, Spacing3D } from '@/core/types';

export type Modality = 'CT' | 'MR' | 'PT' | 'OTHER';

export type VolumeDType = 'int16' | 'uint16';

export interface Volume3D {
  readonly extent: Extent3D;
  readonly spacing: Spacing3D;
  readonly modality: Modality;
  readonly dtype: VolumeDType;
  readonly data: Int16Array | Uint16Array;
  readonly minValue: number;
  readonly maxValue: number;
}

export interface PreprocessedManifest {
  readonly schema: 'zizi-volume/v1';
  readonly extent: Extent3D;
  readonly spacing: Spacing3D;
  readonly modality: Modality;
  readonly dtype: VolumeDType;
  readonly minValue: number;
  readonly maxValue: number;
  readonly rawSha256: string;
  readonly raw: string;
}
