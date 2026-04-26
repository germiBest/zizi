export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];

export type Mat4 = Float32Array;

declare const _resourceHandle: unique symbol;
export type ResourceHandle = string & { readonly [_resourceHandle]: 'handle' };
export const handle = (name: string): ResourceHandle => name as ResourceHandle;

export type DisposeFn = () => void;

export interface Extent3D {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface Spacing3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
