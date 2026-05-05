import { describe, expect, it } from 'vitest';
import { f32ToF16Bits, packF16FromInts } from '@/core/f16';

describe('f32ToF16Bits', () => {
  it('handles zero', () => {
    expect(f32ToF16Bits(0)).toBe(0);
    expect(f32ToF16Bits(-0)).toBe(0x8000);
  });

  it('handles ±1', () => {
    expect(f32ToF16Bits(1)).toBe(0x3c00);
    expect(f32ToF16Bits(-1)).toBe(0xbc00);
  });

  it('handles powers of two', () => {
    expect(f32ToF16Bits(2)).toBe(0x4000);
    expect(f32ToF16Bits(0.5)).toBe(0x3800);
    expect(f32ToF16Bits(0.25)).toBe(0x3400);
    expect(f32ToF16Bits(1024)).toBe(0x6400);
    expect(f32ToF16Bits(-1024)).toBe(0xe400);
  });

  it('handles infinities and NaN', () => {
    expect(f32ToF16Bits(Number.POSITIVE_INFINITY)).toBe(0x7c00);
    expect(f32ToF16Bits(Number.NEGATIVE_INFINITY)).toBe(0xfc00);
    expect(f32ToF16Bits(Number.NaN) & 0x7c00).toBe(0x7c00);
  });

  it('overflows large values to ±Inf', () => {
    expect(f32ToF16Bits(1e10)).toBe(0x7c00);
    expect(f32ToF16Bits(-1e10)).toBe(0xfc00);
  });

  it('underflows tiny values to ±0', () => {
    expect(f32ToF16Bits(1e-30)).toBe(0);
    expect(f32ToF16Bits(-1e-30)).toBe(0x8000);
  });

  it('round-trips a range of HU-like integers within f16 precision', () => {
    const dv = new DataView(new ArrayBuffer(2));
    for (let hu = -1024; hu <= 3071; hu += 37) {
      const bits = f32ToF16Bits(hu);
      dv.setUint16(0, bits, true);
      const recovered = decodeF16(dv.getUint16(0, true));
      expect(Math.abs(recovered - hu)).toBeLessThan(2);
    }
  });
});

describe('packF16FromInts', () => {
  it('packs an Int16Array of HU values', () => {
    const src = new Int16Array([0, 1, -1, 1024, -1024, 700]);
    const out = new Uint16Array(src.length);
    packF16FromInts(out, src);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0x3c00);
    expect(out[2]).toBe(0xbc00);
    expect(out[3]).toBe(0x6400);
    expect(out[4]).toBe(0xe400);
  });

  it('clamps to the shorter of source / dest length', () => {
    const out = new Uint16Array(2);
    packF16FromInts(out, new Int16Array([1, 2, 3, 4]));
    expect(out[0]).toBe(0x3c00);
    expect(out[1]).toBe(0x4000);
  });
});

function decodeF16(bits: number): number {
  const sign = (bits >>> 15) & 1;
  const exp = (bits >>> 10) & 0x1f;
  const mant = bits & 0x3ff;
  if (exp === 0) {
    if (mant === 0) return sign ? -0 : 0;
    return (sign ? -1 : 1) * (mant / 1024) * 2 ** -14;
  }
  if (exp === 31) {
    if (mant === 0) return sign ? -Infinity : Infinity;
    return Number.NaN;
  }
  return (sign ? -1 : 1) * (1 + mant / 1024) * 2 ** (exp - 15);
}
