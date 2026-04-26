export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Welford {
  count = 0;
  mean = 0;
  private m2 = 0;

  push(x: number): void {
    this.count += 1;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.m2 += delta * delta2;
  }

  variance(): number {
    return this.count > 1 ? this.m2 / (this.count - 1) : 0;
  }

  stddev(): number {
    return Math.sqrt(this.variance());
  }

  reset(): void {
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
  }
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (p <= 0) return sorted[0]!;
  if (p >= 100) return sorted[sorted.length - 1]!;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[clamped]!;
}

export interface FrameStats {
  count: number;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

const ZERO_STATS: FrameStats = {
  count: 0,
  mean: 0,
  stddev: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  min: 0,
  max: 0,
};

export function summarize(samples: readonly number[]): FrameStats {
  if (samples.length === 0) return { ...ZERO_STATS };
  const sorted = samples.slice().sort((a, b) => a - b);
  const w = new Welford();
  for (const x of samples) w.push(x);
  return {
    count: samples.length,
    mean: w.mean,
    stddev: w.stddev(),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}
