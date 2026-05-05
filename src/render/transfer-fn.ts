import { invariant } from '@/core/assert';
import { type Hounsfield, HU } from '@/core/units';
import type { GpuContext } from '@/gpu/context';
import { createTexture, type GpuTexture } from '@/gpu/resources';

export type TfPresetName =
  | 'lung'
  | 'soft'
  | 'bone'
  | 'brain'
  | 'hot-iron'
  | 'viridis'
  | 'magma'
  | 'x-ray'
  | 'mip-gray'
  | 'vessel-red'
  | 'bone-gold'
  | 'twilight';

export type TfPresetKind = 'clinical' | 'colormap';

export interface TfPresetMeta {
  readonly name: TfPresetName;
  readonly label: string;
  readonly kind: TfPresetKind;
}

export const TF_PRESET_LIST: readonly TfPresetMeta[] = [
  { name: 'lung', label: 'Lung', kind: 'clinical' },
  { name: 'soft', label: 'Soft', kind: 'clinical' },
  { name: 'bone', label: 'Bone', kind: 'clinical' },
  { name: 'brain', label: 'Brain', kind: 'clinical' },
  { name: 'hot-iron', label: 'Hot Iron', kind: 'colormap' },
  { name: 'viridis', label: 'Viridis', kind: 'colormap' },
  { name: 'magma', label: 'Magma', kind: 'colormap' },
  { name: 'x-ray', label: 'X-Ray', kind: 'colormap' },
  { name: 'mip-gray', label: 'MIP Gray', kind: 'colormap' },
  { name: 'vessel-red', label: 'Vessel Red', kind: 'colormap' },
  { name: 'bone-gold', label: 'Bone Gold', kind: 'colormap' },
  { name: 'twilight', label: 'Twilight', kind: 'colormap' },
];

export interface TfPoint {
  readonly hu: Hounsfield;
  readonly rgba: readonly [number, number, number, number];
}

export const TF_LUT_SIZE = 256;

const pt = (hu: number, r: number, g: number, b: number, a: number): TfPoint => ({
  hu: HU(hu),
  rgba: [r, g, b, a],
});

const PRESETS: Record<TfPresetName, readonly TfPoint[]> = {
  lung: [
    pt(-1000, 0.05, 0.05, 0.08, 0),
    pt(-700, 0.55, 0.55, 0.7, 0.18),
    pt(-400, 0.9, 0.7, 0.55, 0.45),
    pt(0, 1, 0.95, 0.85, 0),
  ],
  soft: [
    pt(-160, 0.05, 0.05, 0.05, 0),
    pt(-90, 0.85, 0.55, 0.35, 0.05),
    pt(40, 1, 0.62, 0.32, 0.42),
    pt(200, 1, 0.95, 0.8, 0.78),
  ],
  bone: [
    pt(150, 0, 0, 0, 0),
    pt(300, 0.5, 0.35, 0.25, 0.18),
    pt(600, 0.85, 0.7, 0.5, 0.52),
    pt(1000, 1, 0.95, 0.85, 0.95),
  ],
  brain: [
    pt(-30, 0, 0, 0, 0),
    pt(15, 0.5, 0.45, 0.4, 0.18),
    pt(35, 0.75, 0.62, 0.52, 0.45),
    pt(60, 1, 0.92, 0.82, 0.85),
  ],
  'hot-iron': [
    pt(-1024, 0, 0, 0, 0),
    pt(-200, 0.25, 0, 0, 0.15),
    pt(0, 0.6, 0, 0, 0.35),
    pt(200, 1, 0.3, 0, 0.55),
    pt(600, 1, 0.7, 0, 0.75),
    pt(1200, 1, 1, 0.7, 0.92),
  ],
  viridis: [
    pt(-1024, 0.27, 0, 0.33, 0),
    pt(-300, 0.27, 0.16, 0.49, 0.2),
    pt(0, 0.21, 0.36, 0.55, 0.4),
    pt(300, 0.13, 0.57, 0.55, 0.55),
    pt(700, 0.37, 0.79, 0.38, 0.75),
    pt(1200, 0.99, 0.91, 0.14, 0.92),
  ],
  magma: [
    pt(-1024, 0, 0, 0.05, 0),
    pt(-300, 0.16, 0.06, 0.27, 0.2),
    pt(0, 0.36, 0.08, 0.43, 0.42),
    pt(300, 0.65, 0.21, 0.46, 0.6),
    pt(700, 0.96, 0.43, 0.42, 0.78),
    pt(1200, 0.99, 0.96, 0.74, 0.92),
  ],
  'x-ray': [
    pt(-1024, 0, 0, 0, 0),
    pt(0, 0.32, 0.32, 0.32, 0.18),
    pt(400, 0.65, 0.65, 0.65, 0.55),
    pt(900, 0.92, 0.92, 0.92, 0.82),
    pt(1500, 1, 1, 1, 0.96),
  ],
  'mip-gray': [
    pt(-1024, 1, 1, 1, 0),
    pt(-200, 1, 1, 1, 0.05),
    pt(200, 1, 1, 1, 0.4),
    pt(800, 1, 1, 1, 0.85),
    pt(1500, 1, 1, 1, 0.98),
  ],
  'vessel-red': [
    pt(80, 0.1, 0, 0, 0),
    pt(150, 0.45, 0, 0, 0.15),
    pt(280, 0.78, 0.1, 0.05, 0.45),
    pt(500, 0.95, 0.35, 0.1, 0.75),
    pt(900, 1, 0.7, 0.18, 0.95),
  ],
  'bone-gold': [
    pt(150, 0.05, 0.02, 0, 0),
    pt(300, 0.35, 0.18, 0.05, 0.22),
    pt(550, 0.7, 0.45, 0.1, 0.5),
    pt(800, 0.95, 0.78, 0.3, 0.78),
    pt(1100, 1, 0.96, 0.78, 0.95),
  ],
  twilight: [
    pt(-1024, 0.16, 0.05, 0.21, 0),
    pt(-200, 0.32, 0.2, 0.55, 0.25),
    pt(150, 0.62, 0.42, 0.78, 0.5),
    pt(500, 0.92, 0.7, 0.85, 0.72),
    pt(1100, 1, 0.92, 0.96, 0.92),
  ],
};

export class TransferFn {
  readonly points: readonly TfPoint[];

  constructor(points: readonly TfPoint[]) {
    invariant(points.length >= 2, 'TransferFn needs at least 2 points');
    this.points = [...points].sort((a, b) => (a.hu as number) - (b.hu as number));
  }

  static preset(name: TfPresetName): TransferFn {
    return new TransferFn(PRESETS[name]);
  }

  sample(hu: number): [number, number, number, number] {
    return sampleAt(this.points, hu);
  }

  rasterize(out: Uint8Array, huMin: number, huMax: number): void {
    invariant(out.length === TF_LUT_SIZE * 4, `out must be ${TF_LUT_SIZE * 4} bytes`);
    invariant(huMax > huMin, 'huMax must exceed huMin');
    const range = huMax - huMin;
    for (let i = 0; i < TF_LUT_SIZE; i++) {
      const rgba = sampleAt(this.points, huMin + (i / (TF_LUT_SIZE - 1)) * range);
      const off = i * 4;
      out[off] = u8(rgba[0]);
      out[off + 1] = u8(rgba[1]);
      out[off + 2] = u8(rgba[2]);
      out[off + 3] = u8(rgba[3]);
    }
  }
}

export class TransferFnTexture {
  readonly view: GPUTextureView;
  readonly sampler: GPUSampler;
  private readonly tex: GpuTexture;
  private readonly bytes = new Uint8Array(TF_LUT_SIZE * 4);

  constructor(private readonly ctx: GpuContext) {
    this.tex = createTexture(ctx.device, ctx.registry, {
      label: 'tf.lut',
      size: { width: TF_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.view = this.tex.texture.createView({ label: 'tf.view' });
    this.sampler = ctx.device.createSampler({
      label: 'tf.sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  upload(tf: TransferFn, huMin: number, huMax: number): void {
    tf.rasterize(this.bytes, huMin, huMax);
    this.ctx.queue.writeTexture(
      { texture: this.tex.texture },
      this.bytes,
      { bytesPerRow: TF_LUT_SIZE * 4, rowsPerImage: 1 },
      { width: TF_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
    );
  }

  dispose(): void {
    this.tex.dispose();
  }
}

function sampleAt(sorted: readonly TfPoint[], hu: number): [number, number, number, number] {
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (hu <= (first.hu as number))
    return [first.rgba[0], first.rgba[1], first.rgba[2], first.rgba[3]];
  if (hu >= (last.hu as number)) return [last.rgba[0], last.rgba[1], last.rgba[2], last.rgba[3]];
  for (let s = 0; s < sorted.length - 1; s++) {
    const a = sorted[s]!;
    const b = sorted[s + 1]!;
    const huA = a.hu as number;
    const huB = b.hu as number;
    if (hu >= huA && hu <= huB) {
      const t = huB > huA ? (hu - huA) / (huB - huA) : 0;
      return [
        a.rgba[0] + (b.rgba[0] - a.rgba[0]) * t,
        a.rgba[1] + (b.rgba[1] - a.rgba[1]) * t,
        a.rgba[2] + (b.rgba[2] - a.rgba[2]) * t,
        a.rgba[3] + (b.rgba[3] - a.rgba[3]) * t,
      ];
    }
  }
  return [first.rgba[0], first.rgba[1], first.rgba[2], first.rgba[3]];
}

function u8(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 255;
  return Math.round(x * 255);
}
