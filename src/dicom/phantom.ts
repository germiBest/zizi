import { invariant } from '@/core/assert';
import type { Volume3D } from './types';

export interface PhantomOptions {
  readonly size?: number;
  readonly spacingMm?: number;
}

export function generatePhantom(opts: PhantomOptions = {}): Volume3D {
  const size = opts.size ?? 64;
  const spacing = opts.spacingMm ?? 1;
  invariant(Number.isInteger(size) && size > 0, 'phantom size must be a positive integer');
  invariant(spacing > 0 && Number.isFinite(spacing), 'phantom spacing must be positive finite');

  const data = new Int16Array(size * size * size);
  const c = (size - 1) / 2;
  const sphereR2 = (size * 0.35) ** 2;
  const cubeR = size * 0.45;

  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c;
        const dy = y - c;
        const dz = z - c;
        const d2 = dx * dx + dy * dy + dz * dz;

        let v: number;
        if (d2 < sphereR2) {
          v = 700;
        } else if (Math.abs(dx) < cubeR && Math.abs(dy) < cubeR && Math.abs(dz) < cubeR) {
          const t = z / Math.max(1, size - 1);
          v = Math.round(-200 + 400 * t);
        } else {
          v = -1000;
        }

        const idx = z * size * size + y * size + x;
        data[idx] = v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
  }

  return {
    extent: { width: size, height: size, depth: size },
    spacing: { x: spacing, y: spacing, z: spacing },
    modality: 'CT',
    dtype: 'int16',
    data,
    minValue: minV,
    maxValue: maxV,
  };
}
