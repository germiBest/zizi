# zizi

Browser-based DICOM volume renderer on WebGPU. Real-time DVR + MPR with HTJ2K
streaming and pyramidal multi-resolution loading. No install, no plugin, no
PACS — open a `manifest.json` URL and the volume renders.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/`. Default loads a synthetic 64³ phantom; pass
`?volume=/datasets/<name>/manifest.json` for a preprocessed CT.

## What's in the box

- **Direct volume rendering** — front-to-back compositing, opacity correction,
  early ray termination, optional Lambert + Blinn-Phong shading from on-the-fly
  6-tap gradient
- **Render modes** — DVR / MIP / MinIP / Average, picked from the top bar
- **3-up MPR** — axial / sagittal / coronal slices with slab thickness 1–64
  and min / max / avg reduction
- **Transfer-function library** — 12 presets (4 clinical W/L-paired, 8
  colormaps: hot-iron, viridis, magma, x-ray, mip-gray, vessel-red, bone-gold,
  twilight) plus a draggable point editor
- **Window/Level** — right-mouse-drag in the 3D viewport; keyboard 1-4 for
  clinical presets
- **Cloud-native data path** — HTJ2K codestreams via
  `@cornerstonejs/codec-openjph`; SHA-256 verified per slice; concurrent
  fetch + decode + GPU upload
- **Pyramidal loading** — coarsest level renders sub-second; finer levels
  swap in atomically as they arrive; auto-cap to GPU memory limits
- **Per-pass GPU timestamps** — FPS reflects `max(cpu, gpu)` so it doesn't lie
  when the GPU is the bottleneck

## Architecture

```
core/      pure: branded units, stats, events, f16 packing
dicom/     manifest types + streaming loader
gpu/       WebGPU wrappers: context, surface, registry, pipeline, timestamps
codec/     lazy-loaded HTJ2K decoder
render/    raycaster + MPR passes, display blit, pyramid bundle swap
camera/    orbit camera, projection
state/     pull-based AppState with version counter
ui/        top bar, bottom controls, palette gallery, TF editor, perf overlay
bench/     BenchRecord v2 schema (week-7 work in progress)
```

Single `Renderer.tick(dt, snapshot)` entry. Rendered by rAF in the viewer;
driven by explicit ticks in headless bench. One `GpuContext` shared by four
`Surface`s (3D + 3 MPR canvases). `Pass` interface declares `reads` / `writes`
resource handles for a future frame-graph.

## Preprocessing real DICOM

Python preprocessor under `tools/preprocess/`. Parses pydicom series, sorts
by `ImagePositionPatient`, applies `RescaleSlope/Intercept` → HU, optionally
encodes HTJ2K (requires `brew install openjph`) and / or generates an
anisotropic resolution pyramid.

```sh
cd tools/preprocess
uv sync
uv run preprocess dicom <dicom-dir> --out ../../public/datasets/<name> \
    --compress htj2k --pyramid
```

The browser fetches `<name>/manifest.json`; everything else (slice files, raw
fallback, level subdirectories) is referenced from there.

## Tech

TypeScript (strict + `verbatimModuleSyntax` + `noUncheckedIndexedAccess`),
Vite 6 multi-entry, Biome, Vitest. WebGPU only — Chrome 113+, Safari TP,
Firefox Nightly. No WebGL fallback.

## Status

Renderer side feature-complete. Working on benchmarks vs OHIF / Cornerstone3D
/ VTK.js next.

## License

MIT.
