import { describe, expect, it } from 'vitest';
import { generatePhantom } from '@/dicom/phantom';

describe('generatePhantom', () => {
  it('produces a cube of the requested size', () => {
    const v = generatePhantom({ size: 32 });
    expect(v.extent).toEqual({ width: 32, height: 32, depth: 32 });
    expect(v.data.length).toBe(32 * 32 * 32);
    expect(v.dtype).toBe('int16');
    expect(v.modality).toBe('CT');
    expect(v.data).toBeInstanceOf(Int16Array);
  });

  it('value range respects plausible HU bounds', () => {
    const v = generatePhantom({ size: 16 });
    expect(v.minValue).toBeLessThan(0);
    expect(v.maxValue).toBeGreaterThan(0);
    expect(v.minValue).toBeGreaterThanOrEqual(-1024);
    expect(v.maxValue).toBeLessThanOrEqual(3071);
  });

  it('is deterministic — same size produces identical buffers', () => {
    const a = generatePhantom({ size: 16 });
    const b = generatePhantom({ size: 16 });
    expect(a.data).toEqual(b.data);
    expect(a.minValue).toBe(b.minValue);
    expect(a.maxValue).toBe(b.maxValue);
  });

  it('center sample is bone-like (>= 500 HU)', () => {
    const v = generatePhantom({ size: 32 });
    const idx = 16 * 32 * 32 + 16 * 32 + 16;
    expect(v.data[idx]).toBeGreaterThanOrEqual(500);
  });

  it('corner sample is air-like (<= -900 HU)', () => {
    const v = generatePhantom({ size: 32 });
    expect(v.data[0]).toBeLessThanOrEqual(-900);
  });

  it('rejects invalid options', () => {
    expect(() => generatePhantom({ size: 0 })).toThrow();
    expect(() => generatePhantom({ size: -8 })).toThrow();
    expect(() => generatePhantom({ size: 8.5 })).toThrow();
    expect(() => generatePhantom({ size: 8, spacingMm: 0 })).toThrow();
  });
});
