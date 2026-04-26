// TODO(week 5-6): MPR pass.
// Three slicing planes (axial, sagittal, coronal) with slab thickness control.
// Compute shader samples N slices per output pixel and reduces with min/max/avg.

export type MprPlane = 'axial' | 'sagittal' | 'coronal';
export type SlabReduce = 'min' | 'max' | 'avg';

export interface MprStubOptions {
  readonly plane: MprPlane;
  readonly slabSlices: number;
  readonly reduce: SlabReduce;
}
