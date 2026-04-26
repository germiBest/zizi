import { mulberry32 } from '@/core/stats';
import type { Scenario } from './scenarios';

export interface ScenarioResult {
  readonly scenario: Scenario;
  readonly frameTimesMs: number[];
  readonly gpuTimesMs: number[] | null;
}

// TODO(week 7): real scenarios drive Renderer.tick() in a loop, awaiting
// queue.onSubmittedWorkDone() between frames for deterministic per-frame timing.
// Current synthetic version exists so the schema and downstream pipeline are
// exercised from day 1.

export function runSyntheticScenario(
  scenario: Scenario,
  frames = 100,
  seed = 0xc0ffee,
): ScenarioResult {
  const rng = mulberry32(seed);
  const frameTimesMs: number[] = [];
  for (let i = 0; i < frames; i++) {
    frameTimesMs.push(8 + rng() * 4);
  }
  return { scenario, frameTimesMs, gpuTimesMs: null };
}
