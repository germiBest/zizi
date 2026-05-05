import { describe, expect, it } from 'vitest';
import { HU } from '@/core/units';
import { TF_LUT_SIZE, type TfPoint, TransferFn } from '@/render/transfer-fn';

describe('TransferFn.sample', () => {
  it('returns first point for HU below range', () => {
    const tf = new TransferFn([
      { hu: HU(0), rgba: [0.5, 0.5, 0.5, 0.5] },
      { hu: HU(100), rgba: [1, 1, 1, 1] },
    ]);
    expect(tf.sample(-50)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('returns last point for HU above range', () => {
    const tf = new TransferFn([
      { hu: HU(0), rgba: [0, 0, 0, 0] },
      { hu: HU(100), rgba: [1, 1, 1, 1] },
    ]);
    expect(tf.sample(200)).toEqual([1, 1, 1, 1]);
  });

  it('linearly interpolates between two points', () => {
    const tf = new TransferFn([
      { hu: HU(0), rgba: [0, 0, 0, 0] },
      { hu: HU(100), rgba: [1, 1, 1, 1] },
    ]);
    const mid = tf.sample(50);
    expect(mid[0]).toBeCloseTo(0.5, 12);
    expect(mid[1]).toBeCloseTo(0.5, 12);
    expect(mid[2]).toBeCloseTo(0.5, 12);
    expect(mid[3]).toBeCloseTo(0.5, 12);
  });

  it('sorts unsorted control points on construction', () => {
    const points: TfPoint[] = [
      { hu: HU(100), rgba: [1, 1, 1, 1] },
      { hu: HU(0), rgba: [0, 0, 0, 0] },
    ];
    const tf = new TransferFn(points);
    expect(tf.sample(50)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('handles three-point ramps correctly at segment boundary', () => {
    const tf = new TransferFn([
      { hu: HU(0), rgba: [0, 0, 0, 0] },
      { hu: HU(100), rgba: [1, 0, 0, 1] },
      { hu: HU(200), rgba: [0, 1, 0, 0] },
    ]);
    const exact = tf.sample(100);
    expect(exact).toEqual([1, 0, 0, 1]);
    const between = tf.sample(150);
    expect(between[0]).toBeCloseTo(0.5, 12);
    expect(between[1]).toBeCloseTo(0.5, 12);
    expect(between[3]).toBeCloseTo(0.5, 12);
  });

  it('rejects too-few points', () => {
    expect(() => new TransferFn([{ hu: HU(0), rgba: [0, 0, 0, 0] }])).toThrow();
  });
});

describe('TransferFn.rasterize', () => {
  it('produces 256×4 bytes', () => {
    const tf = TransferFn.preset('soft');
    const out = new Uint8Array(TF_LUT_SIZE * 4);
    tf.rasterize(out, -160, 240);
    expect(out.length).toBe(1024);
  });

  it('rasterizes a black→white linear ramp into a monotonic gray gradient', () => {
    const tf = new TransferFn([
      { hu: HU(0), rgba: [0, 0, 0, 0] },
      { hu: HU(255), rgba: [1, 1, 1, 1] },
    ]);
    const out = new Uint8Array(TF_LUT_SIZE * 4);
    tf.rasterize(out, 0, 255);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(0);
    expect(out[1020]).toBe(255);
    expect(out[1023]).toBe(255);
    for (let i = 4; i < 1024; i += 4) {
      expect(out[i]!).toBeGreaterThanOrEqual(out[i - 4]!);
    }
  });

  it('endpoint LUT entries match the first/last control point', () => {
    const tf = TransferFn.preset('bone');
    const out = new Uint8Array(TF_LUT_SIZE * 4);
    tf.rasterize(out, 150, 1000);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
    expect(out[1020]).toBeGreaterThan(240);
    expect(out[1023]).toBeGreaterThan(240);
  });

  it('rejects mismatched output size', () => {
    const tf = TransferFn.preset('soft');
    expect(() => tf.rasterize(new Uint8Array(100), 0, 1)).toThrow();
  });

  it('rejects huMax <= huMin', () => {
    const tf = TransferFn.preset('soft');
    const out = new Uint8Array(TF_LUT_SIZE * 4);
    expect(() => tf.rasterize(out, 100, 100)).toThrow();
    expect(() => tf.rasterize(out, 100, 50)).toThrow();
  });
});

describe('TransferFn.preset', () => {
  it('returns a non-empty TF for each preset name', () => {
    for (const name of ['lung', 'soft', 'bone', 'brain'] as const) {
      const tf = TransferFn.preset(name);
      expect(tf.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('soft preset transitions through positive HU values', () => {
    const tf = TransferFn.preset('soft');
    const a = tf.sample(0);
    const b = tf.sample(100);
    expect(b[3]).toBeGreaterThan(a[3]);
  });
});
