declare const _brand: unique symbol;
type Brand<T, B> = T & { readonly [_brand]: B };

export type Hounsfield = Brand<number, 'HU'>;
export type Millimeter = Brand<number, 'mm'>;
export type SliceIndex = Brand<number, 'slice'>;
export type Voxel = Brand<number, 'voxel'>;
export type Normalized = Brand<number, 'normalized'>;

export const HU = (n: number): Hounsfield => n as Hounsfield;
export const mm = (n: number): Millimeter => n as Millimeter;
export const slice = (n: number): SliceIndex => n as SliceIndex;
export const vox = (n: number): Voxel => n as Voxel;
export const norm = (n: number): Normalized => n as Normalized;

export const HU_AIR: Hounsfield = HU(-1000);
export const HU_LUNG: Hounsfield = HU(-700);
export const HU_FAT: Hounsfield = HU(-100);
export const HU_WATER: Hounsfield = HU(0);
export const HU_MUSCLE: Hounsfield = HU(40);
export const HU_BLOOD: Hounsfield = HU(60);
export const HU_BONE_SOFT: Hounsfield = HU(300);
export const HU_BONE: Hounsfield = HU(700);
export const HU_BONE_DENSE: Hounsfield = HU(1900);

export interface WindowLevel {
  readonly center: Hounsfield;
  readonly width: Hounsfield;
}

export const WL_LUNG: WindowLevel = { center: HU(-600), width: HU(1500) };
export const WL_SOFT: WindowLevel = { center: HU(40), width: HU(400) };
export const WL_BONE: WindowLevel = { center: HU(300), width: HU(1500) };
export const WL_BRAIN: WindowLevel = { center: HU(40), width: HU(80) };
