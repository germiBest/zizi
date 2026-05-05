import { describe, expect, it } from 'vitest';
import { HU } from '@/core/units';
import type { TfPoint } from '@/render/transfer-fn';
import {
  alphaToY,
  clampPointHu,
  findHitPoint,
  huToX,
  insertSorted,
  removeAt,
  xToHu,
  yToAlpha,
} from '@/ui/tf-editor';

const RANGE = { lo: 0, hi: 100 };
const RECT = { width: 600, height: 100 };

describe('huToX / xToHu', () => {
  it('round-trips through canvas-pixel space', () => {
    for (const hu of [0, 25, 50, 75, 100]) {
      const x = huToX(hu, RANGE, RECT.width);
      const back = xToHu(x, RANGE, RECT.width);
      expect(back).toBeCloseTo(hu, 6);
    }
  });

  it('maps range endpoints to 0 and width', () => {
    expect(huToX(0, RANGE, 600)).toBe(0);
    expect(huToX(100, RANGE, 600)).toBe(600);
  });
});

describe('alphaToY / yToAlpha', () => {
  it('top of canvas = α 1, bottom = α 0', () => {
    expect(alphaToY(1, 100)).toBe(0);
    expect(alphaToY(0, 100)).toBe(100);
    expect(yToAlpha(0, 100)).toBeCloseTo(1, 12);
    expect(yToAlpha(100, 100)).toBeCloseTo(0, 12);
  });

  it('clamps out-of-range α', () => {
    expect(alphaToY(2, 100)).toBe(0);
    expect(alphaToY(-0.5, 100)).toBe(100);
  });
});

describe('findHitPoint', () => {
  const points: TfPoint[] = [
    { hu: HU(20), rgba: [1, 0, 0, 0.5] },
    { hu: HU(50), rgba: [0, 1, 0, 0.8] },
    { hu: HU(80), rgba: [0, 0, 1, 0.2] },
  ];

  it('finds a point under cursor within threshold', () => {
    const x = huToX(50, RANGE, RECT.width);
    const y = alphaToY(0.8, RECT.height);
    expect(findHitPoint(points, x, y, RANGE, RECT, 8)).toBe(1);
  });

  it('returns -1 when far from any point', () => {
    expect(findHitPoint(points, 0, 0, RANGE, RECT, 8)).toBe(-1);
  });
});

describe('clampPointHu', () => {
  const pts: TfPoint[] = [
    { hu: HU(0), rgba: [0, 0, 0, 0] },
    { hu: HU(50), rgba: [0, 0, 0, 0.5] },
    { hu: HU(100), rgba: [0, 0, 0, 1] },
  ];

  it('clamps middle point to neighbor bounds', () => {
    expect(clampPointHu(150, 1, pts)).toBe(99);
    expect(clampPointHu(-50, 1, pts)).toBe(1);
    expect(clampPointHu(50, 1, pts)).toBe(50);
  });

  it('first/last points are bounded only by one neighbor', () => {
    expect(clampPointHu(-1000, 0, pts)).toBe(-1000);
    expect(clampPointHu(60, 0, pts)).toBe(49);
    expect(clampPointHu(1000, 2, pts)).toBe(1000);
  });
});

describe('insertSorted / removeAt', () => {
  const pts: TfPoint[] = [
    { hu: HU(0), rgba: [0, 0, 0, 0] },
    { hu: HU(100), rgba: [1, 1, 1, 1] },
  ];

  it('insertSorted keeps points sorted by hu', () => {
    const next = insertSorted(pts, { hu: HU(50), rgba: [0.5, 0.5, 0.5, 0.5] });
    expect(next.map((p) => p.hu as number)).toEqual([0, 50, 100]);
  });

  it('insertSorted handles inserting before first / after last', () => {
    const before = insertSorted(pts, { hu: HU(-10), rgba: [0, 0, 0, 0] });
    expect(before[0]!.hu as number).toBe(-10);
    const after = insertSorted(pts, { hu: HU(200), rgba: [0, 0, 0, 0] });
    expect(after[after.length - 1]!.hu as number).toBe(200);
  });

  it('removeAt deletes by index when length > 2', () => {
    const three: TfPoint[] = [...pts, { hu: HU(50), rgba: [0.5, 0.5, 0.5, 0.5] }];
    const sorted = three.sort((a, b) => (a.hu as number) - (b.hu as number));
    const next = removeAt(sorted, 1);
    expect(next.length).toBe(2);
    expect(next.map((p) => p.hu as number)).toEqual([0, 100]);
  });

  it('removeAt refuses to drop below 2 points', () => {
    const next = removeAt(pts, 0);
    expect(next.length).toBe(2);
  });
});
