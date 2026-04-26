// TODO(week 3-4): real implementation.
// 1D LUT texture (rgba8unorm or rgba16float) with click-to-add control points.
// Owned by renderer; bound into raycaster's compute shader once it composites.

export interface TransferFnControlPoint {
  readonly hu: number;
  readonly color: readonly [number, number, number, number];
}

export class TransferFunctionStub {
  readonly controlPoints: TransferFnControlPoint[] = [];
}
