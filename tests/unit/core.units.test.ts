import { describe, expect, it } from 'vitest';
import {
  HU,
  HU_AIR,
  HU_BONE,
  HU_WATER,
  mm,
  norm,
  slice,
  vox,
  WL_BONE,
  WL_LUNG,
  WL_SOFT,
} from '@/core/units';

describe('branded units', () => {
  it('round-trip through brand preserves numeric value', () => {
    expect(HU(40) + 0).toBe(40);
    expect(mm(2.5) + 0).toBe(2.5);
    expect(slice(7) + 0).toBe(7);
    expect(vox(1024) + 0).toBe(1024);
    expect(norm(0.42) + 0).toBe(0.42);
  });

  it('HU presets land at clinically expected values', () => {
    expect(HU_AIR + 0).toBe(-1000);
    expect(HU_WATER + 0).toBe(0);
    expect(HU_BONE + 0).toBe(700);
  });

  it('window/level presets are sane', () => {
    expect(WL_LUNG.center + 0).toBe(-600);
    expect(WL_LUNG.width + 0).toBe(1500);
    expect(WL_SOFT.width + 0).toBe(400);
    expect(WL_BONE.center + 0).toBe(300);
  });
});
