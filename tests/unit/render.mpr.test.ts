import { describe, expect, it } from 'vitest';
import { reduceSlab } from '@/render/mpr';

describe('reduceSlab', () => {
  it('min picks the smallest sample', () => {
    expect(reduceSlab([10, -5, 7, 0], 'min')).toBe(-5);
  });

  it('max picks the largest sample', () => {
    expect(reduceSlab([10, -5, 7, 0], 'max')).toBe(10);
  });

  it('avg returns arithmetic mean', () => {
    expect(reduceSlab([1, 2, 3, 4], 'avg')).toBeCloseTo(2.5, 12);
  });

  it('single-sample slab returns that sample for any reduce', () => {
    expect(reduceSlab([42], 'min')).toBe(42);
    expect(reduceSlab([42], 'max')).toBe(42);
    expect(reduceSlab([42], 'avg')).toBe(42);
  });

  it('empty input returns NaN', () => {
    expect(reduceSlab([], 'min')).toBeNaN();
    expect(reduceSlab([], 'max')).toBeNaN();
    expect(reduceSlab([], 'avg')).toBeNaN();
  });

  it('matches expected reductions on a typical CT slab', () => {
    const slab = [-1000, -200, 40, 700, 1100];
    expect(reduceSlab(slab, 'min')).toBe(-1000);
    expect(reduceSlab(slab, 'max')).toBe(1100);
    expect(reduceSlab(slab, 'avg')).toBeCloseTo(slab.reduce((a, b) => a + b, 0) / 5, 12);
  });
});
