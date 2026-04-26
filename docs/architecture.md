# Architecture

## Pipeline

```
┌──────────┐   ┌────────────────┐   ┌──────────────┐
│ DICOM    │──▶│ Python preproc │──▶│ .raw + .json │
│ (CT/MRI) │   │ pydicom+numpy  │   │ (browser)    │
└──────────┘   └────────────────┘   └──────┬───────┘
                                           │
                                  ┌────────▼─────────┐
                                  │ uploadVolume     │
                                  │ → GPUTexture3D   │
                                  └────────┬─────────┘
                                           │
                              ┌────────────▼─────────────┐
                              │ Renderer.tick(dt)        │
                              │   ┌────────────────┐     │
                              │   │ RaycastPass    │     │
                              │   │ compute MIP    │     │
                              │   │ → storage tex  │     │
                              │   └────────┬───────┘     │
                              │            │             │
                              │   ┌────────▼─────────┐   │
                              │   │ DisplayPass      │   │
                              │   │ fullscreen blit  │   │
                              │   │ → canvas         │   │
                              │   └──────────────────┘   │
                              └──────────────────────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                                 │
                  ┌───────▼───────┐               ┌─────────▼─────────┐
                  │ index.html    │               │ bench.html        │
                  │ rAF loop      │               │ headless tick     │
                  │ (interactive) │               │ + onSubmittedDone │
                  └───────────────┘               └───────────────────┘
```

## Module boundaries

```
core/      pure: no DOM/GPU deps; 100% unit-testable
  └── units, stats (PRNG/percentiles), events, assert, types

dicom/     browser-side data layer
  └── types (Volume3D, manifest), phantom, loader (real impl week 1-2)

gpu/       thin WebGPU wrappers; no domain logic
  └── context (caps + device.lost), resources (registry + Symbol.dispose),
      pipeline factories, swapchain, timestamps, errors (withErrorScope)

render/    domain rendering on top of gpu/
  └── frame (Pass interface w/ reads/writes), volume-upload, raycaster,
      display, renderer (.tick), shaders/{raycast,display,utils,…}.wgsl

camera/    pure math + DOM input
  └── orbit (pointer/wheel), projection (wgpu-matrix)

ui/        DOM-bound; depends on render/, never the reverse
  └── perf-overlay, controls/tf-editor/mpr-viewport (stubs)

bench/     MUST NOT import from ui/
  └── recorder (BenchRecord v1 schema), runner, scenarios, scripts/run.ts
```

## Architectural Invariants

These must hold; they protect benchmark credibility.

1. **`Renderer.tick(dt)` is the only render entrypoint.** rAF (viewer) and
   `await queue.onSubmittedWorkDone() + tick` (bench) are two callers of the
   same function. rAF must never leak into `render/`.
2. **Pull-based, dirty-flag driven.** UI events mark state dirty; the loop
   redraws. Never push a frame from a UI event handler.
3. **Composition root pattern.** `main.ts` and `bench.ts` wire the same
   `Renderer`. No singletons; no module-level mutable state.
4. **Capability detection at boot.** `adapter.features` / `adapter.limits`
   checked once. Optional features declared per code-path with logged fallback.
5. **GPU resource lifecycle = registry + `Symbol.dispose`.** `ResourceRegistry`
   tracks every buffer/texture; `using` / `.dispose()` is sugar.
6. **`device.lost` invalidates the registry; does NOT call `.destroy()`.** Some
   impls throw on resources of a lost device.
7. **Error scopes wrap every submit in dev mode.** Stripped by Vite `define` in
   prod (`if (!__DEV__) return await fn();`).
8. **Branded units in `core/`.** `Hounsfield`, `Millimeter`, `SliceIndex`,
   `Voxel` — catch axis/unit confusion at compile time.
9. **Determinism is a foundation.** Seeded PRNG (mulberry32) in `core/stats.ts`.
   Every bench scenario draws from it.
10. **Bench record schema is settled day 1.** `BenchRecord` includes adapter
    info, Chrome version, commit SHA, dataset SHA-256, power state, canvas DPR,
    warmup-frame count, raw frame-time array. Anything missing makes claims
    unfalsifiable.
11. **`Pass` declares `reads`/`writes` resource handles from day 1.** Unused
    today but the future frame-graph is a refactor, not a rewrite.
12. **Path aliases (`@/core`, `@/gpu`, …) configured in tsconfig + Vite day 1.**
    Future workspace split (apps/viewer + apps/bench) becomes mechanical.

## Trade-offs

| Decision | Why |
|---|---|
| No state-management library | Zero framework overhead in render path = credible bench |
| Single package, multi-entry Vite | Workspace split deferred; aliases keep it mechanical |
| `Pass[]` linear scheduler, not frame graph | Read/write handles already declared; refactor when needed |
| MIP-only week-1 raycaster | Proves whole pipeline; weeks 3-4 add compositing+TF |
| Synthetic phantom, not checked-in DICOM | Avoids LFS + dataset licensing during scaffold |
| `r32float` volume texture | 4× memory vs `r16uint`; fine for 64³ phantom; switch later |
