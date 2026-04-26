import { describe, expect, it } from 'vitest';
import { mulberry32, percentile, summarize, Welford } from '@/core/stats';

describe('mulberry32', () => {
  it('two PRNGs with the same seed produce identical sequences', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('outputs are in [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 10_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let differs = 0;
    for (let i = 0; i < 16; i++) if (a() !== b()) differs += 1;
    expect(differs).toBeGreaterThan(10);
  });
});

describe('Welford', () => {
  it('matches naive variance on a fixed sample', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    const w = new Welford();
    for (const x of xs) w.push(x);
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const naiveVar = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1);
    expect(w.mean).toBeCloseTo(mean, 12);
    expect(w.variance()).toBeCloseTo(naiveVar, 12);
  });

  it('stddev of a constant sequence is exactly 0', () => {
    const w = new Welford();
    for (let i = 0; i < 10; i++) w.push(3);
    expect(w.stddev()).toBe(0);
  });

  it('reset clears state', () => {
    const w = new Welford();
    w.push(10);
    w.push(20);
    w.reset();
    expect(w.count).toBe(0);
    expect(w.mean).toBe(0);
    expect(w.variance()).toBe(0);
  });
});

describe('percentile (nearest-rank)', () => {
  it('p99 of [1..1000] is 990', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i + 1);
    expect(percentile(xs, 99)).toBe(990);
  });

  it('p50 of [1..100] is 50', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 50)).toBe(50);
  });

  it('p95 of [1..100] is 95', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(95);
  });

  it('returns NaN for empty input', () => {
    expect(percentile([], 50)).toBeNaN();
  });

  it('clamps p<=0 to first and p>=100 to last', () => {
    const xs = [10, 20, 30];
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile(xs, -5)).toBe(10);
    expect(percentile(xs, 100)).toBe(30);
    expect(percentile(xs, 200)).toBe(30);
  });
});

describe('summarize', () => {
  it('produces zeroed stats for empty input', () => {
    expect(summarize([])).toEqual({
      count: 0,
      mean: 0,
      stddev: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      min: 0,
      max: 0,
    });
  });

  it('summary of [1..100] has expected mean/min/max/percentiles', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarize(xs);
    expect(s.count).toBe(100);
    expect(s.mean).toBeCloseTo(50.5, 12);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.p50).toBe(50);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
  });
});
