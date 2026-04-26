// Bench scenario catalog. Each scenario, once implemented, drives Renderer.tick(dt)
// in a deterministic loop and produces a frame-time array.

export type Scenario = 'orbit-360' | 'slab-sweep' | 'ttff';

export const ALL_SCENARIOS: readonly Scenario[] = ['orbit-360', 'slab-sweep', 'ttff'];

export interface ScenarioConfig {
  readonly name: Scenario;
  readonly description: string;
  readonly frames: number;
  readonly warmup: number;
}

export const SCENARIOS: Record<Scenario, ScenarioConfig> = {
  'orbit-360': {
    name: 'orbit-360',
    description: 'Continuous 360° orbit around volume; 1000 frames after warmup.',
    frames: 1000,
    warmup: 30,
  },
  'slab-sweep': {
    name: 'slab-sweep',
    description: 'MPR axial with slab thickness 1→64; measures shader scaling.',
    frames: 256,
    warmup: 30,
  },
  ttff: {
    name: 'ttff',
    description: 'Time-to-first-frame from cold-load.',
    frames: 1,
    warmup: 0,
  },
};
