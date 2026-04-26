import { mat4 } from 'wgpu-matrix';

export function perspective(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
  out?: Float32Array,
): Float32Array {
  return mat4.perspective(fovYRad, aspect, near, far, out) as Float32Array;
}

export function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number,
  out?: Float32Array,
): Float32Array {
  return mat4.ortho(left, right, bottom, top, near, far, out) as Float32Array;
}
