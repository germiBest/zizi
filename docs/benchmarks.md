# Benchmarks

Placeholder for week-7 published results. Populated by `pnpm tsx src/bench/scripts/run.ts`
once the real bench harness lands.

## Methodology (planned)

1. Same volume in all viewers (export camera matrix → apply to OHIF/VTK.js).
2. Discard first 30 warmup frames (shader compile, BGL caching).
3. 1000-frame continuous orbit. Record per-frame CPU + GPU times.
4. Repeat on three hardware configs: integrated GPU, discrete GPU, M-series Mac.
5. Pin Chrome flags (`--enable-unsafe-webgpu`, `--disable-frame-rate-limit`).
6. Record adapter info, Chrome version, commit SHA, dataset SHA-256, power state,
   canvas DPR in every `BenchRecord` (schema `zizi-bench/v1`, see
   `src/bench/recorder.ts`).

## Reproducibility

A claim of "X% faster than OHIF" requires every record above to be present.
Without it, the comparison is unfalsifiable and we shouldn't publish it.

## Why these scenarios

- **orbit-360** — steady-state perf; the headline number.
- **slab-sweep** — MPR with slab thickness 1→64 reveals shader scaling.
- **ttff** — time-to-first-frame from cold load; the UX claim.

## Datasets

See `public/datasets/README.md`. TCIA only. No private data, ever.
