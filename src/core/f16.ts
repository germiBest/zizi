// f32 → f16 (IEEE 754 binary16) bit-pack helper.
// Used to upload volume data to r16float WebGPU textures without depending on
// Float16Array (which is Stage 4 TC39 but not universally available yet).

const f32buf = new Float32Array(1);
const u32buf = new Uint32Array(f32buf.buffer);

const QUIET_NAN_F16 = 0x7e00;

export function f32ToF16Bits(value: number): number {
  if (Number.isNaN(value)) return QUIET_NAN_F16;
  if (value === Number.POSITIVE_INFINITY) return 0x7c00;
  if (value === Number.NEGATIVE_INFINITY) return 0xfc00;
  if (value === 0) return Object.is(value, -0) ? 0x8000 : 0;

  f32buf[0] = value;
  const x = u32buf[0]!;
  const sign = (x >>> 31) & 1;
  const expF32 = (x >>> 23) & 0xff;
  const mantF32 = x & 0x7fffff;
  const expReal = expF32 - 127;

  if (expReal > 15) {
    return (sign << 15) | 0x7c00;
  }
  if (expReal < -14) {
    if (expReal < -25) return sign << 15;
    const mant = (mantF32 | 0x800000) >>> (-expReal - 1);
    return (sign << 15) | ((mant + 1) >>> 1);
  }

  const expF16 = expReal + 15;
  const m = (mantF32 + 0x1000) >>> 13;
  if (m & 0x400) {
    if (expF16 === 30) return (sign << 15) | 0x7c00;
    return (sign << 15) | ((expF16 + 1) << 10);
  }
  return (sign << 15) | (expF16 << 10) | m;
}

export function packF16FromF32(out: Uint16Array, src: ArrayLike<number>): void {
  const n = Math.min(out.length, src.length);
  for (let i = 0; i < n; i++) {
    out[i] = f32ToF16Bits(src[i] ?? 0);
  }
}

export function packF16FromInts(out: Uint16Array, src: ArrayLike<number>): void {
  const n = Math.min(out.length, src.length);
  for (let i = 0; i < n; i++) {
    out[i] = f32ToF16Bits(src[i] ?? 0);
  }
}
