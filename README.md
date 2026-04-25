[10.05.2026 14:28] Toretto Bot: ---

🏥 WebGPU DICOM Volume Renderer — MVP Plan

Project Name Suggestion: Volcano / SliceCast / DicomX
(pick something catchy, not medical-sounding)

---

🎯 Goal

Browser-based DICOM volume renderer using WebGPU compute shaders with head-to-head benchmarks against OHIF/Cornerstone3D/VTK.js. Ship honest benchmarks, not marketing. Open-source the whole thing.

---

📁 Repo Structure

dicom-webgpu/
├── README.md                    # HN-ready writeup + benchmarks
├── LICENSE                      # MIT
├── package.json
├── tsconfig.json
├── vite.config.ts               # Fast dev + TS
│
├── public/
│   └── datasets/                # Public DICOM samples (git-lfs)
│       ├── chest-ct-512x512/    # ~300 slices
│       ├── brain-mri-256x256/   # ~200 slices
│       └── README.md            # Links to TCIA source
│
├── src/
│   ├── main.ts                  # Entry point
│   ├── app.css                  # Minimal UI
│   │
│   ├── dicom/                   # DICOM loading layer
│   │   ├── loader.ts            # pydicom preprocessed → JSON/HDR/RAW
│   │   ├── parser.ts            # Browser-side: parse JSON metadata + raw volume
│   │   └── types.ts             # Volume3D, SliceInfo, DICOMMeta
│   │
│   ├── webgpu/                  # Core rendering pipeline
│   │   ├── device.ts            # GPUDevice init, adapter selection, limits logging
│   │   ├── pipeline.ts          # Bind group layout, compute/render pipeline creation
│   │   ├── volume-upload.ts     # Volume → GPUTexture (3D texture) + staging buffer
│   │   ├── shaders/
│   │   │   ├── raycast.wgsl     # ★ Volume raycasting compute shader
│   │   │   ├── mpr.wgsl         # ★ MPR (axial/sagittal/coronal) compute shader
│   │   │   ├── transfer-fn.wgsl # Transfer function (1D LUT texture)
│   │   │   ├── display.wgsl     # Fullscreen quad render (compute output → canvas)
│   │   │   └── utils.wgsl       # Shared WGSL utilities
│   │   └── renderer.ts          # Main render loop: dispatch compute → copy → present
│   │
│   ├── ui/                      # Controls (keep minimal)
│   │   ├── controls.ts          # Window/Level, camera orbit, slab thickness
│   │   ├── transfer-fn-editor.ts # Canvas-based 1D TF editor
│   │   ├── mpr-viewport.ts      # Axial/Sagittal/Coronal slice viewer
│   │   └── perf-overlay.ts      # FPS, GPU time, memory usage
│   │
│   ├── camera/
│   │   ├── orbit.ts             # Orbit camera (mouse drag + scroll)
│   │   └── projection.ts        # Perspective + orthographic
│   │
│   └── bench/                   # ★ Benchmark harness (the differentiator)
│       ├── runner.ts            # Benchmark orchestrator
│       ├── metrics.ts           # Frame times, GPU memory, 99th percentile
│       ├── recorder.ts          # Export JSON results
│       └── competitor/          # Comparison setups
│           ├── ohif-frame.html  # OHIF embed for same-volume test
│           └── vtkjs-frame.html # VTK.js embed for same-volume test
│
├── scripts/
│   ├── preprocess-dicom.py      # pydicom → .raw + .json (run once)
│   └── run-benchmarks.sh        # Headless benchmark runner
│
└── docs/
    ├── architecture.md          # Shader pipeline diagram
    ├── benchmarks.md            # Published results
    └── blog-post.md             # HN article draft


---

🔧 Shader Pipeline

Architecture (compute-first, no fragment shaders for volume work)
 (1/4)
[10.05.2026 14:28] Toretto Bot: ┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ DICOM files  │────▶│ Python preprocess │────▶│ .raw + .json │
│ (CT/MRI)     │     │ pydicom → HDR/RAW│     │ (browser)   │
└─────────────┘     └──────────────────┘     └──────┬──────┘
                                                     │
                                            ┌────────▼────────┐
                                            │ GPU Upload       │
                                            │ → GPUTexture3D   │
                                            │ → TransferFn LUT │
                                            │ → Camera UBO     │
                                            └────────┬────────┘
                                                     │
                                           ┌─────────▼─────────┐
                                           │ COMPUTE SHADER     │
                                           │ (raycast.wgsl)     │
                                           │                    │
                                           │ For each pixel:    │
                                           │  1. Unproject ray  │
                                           │  2. Ray-box intersect│
                                           │  3. Sample 3D tex  │
                                           │  4. Apply transfer fn│
                                           │  5. Front-to-back  │
                                           │     compositing    │
                                           │  6. Write RGBA     │
                                           │                    │
                                           │ Output: rgba8 texture│
                                           └─────────┬─────────┘
                                                     │
                                           ┌─────────▼─────────┐
                                           │ RENDER SHADER      │
                                           │ (display.wgsl)     │
                                           │ Fullscreen quad    │
                                           │ Compute output →   │
                                           │ canvas             │
                                           └───────────────────┘


MPR Path (simpler compute)
For each pixel in output viewport:
  1. Map pixel → (x,y,z) in volume based on plane equation
  2. Sample slice (with optional slab: avg/max over N slices)
  3. Apply window/level transform
  4. Write grayscale


Key WGSL constructs you'll use:
- @compute @workgroup_size(8, 8) — 2D dispatch, one invocation per pixel
- textureLoad(volume_3d, vec3u(x,y,z), 0) — 3D texture sampling
- Storage texture for compute output (rgba8unorm)
- Uniform buffer for camera matrix, W/L, slab thickness, volume dimensions
- 1D texture for transfer function lookup

---

📊 Benchmark Harness Design

What to measure (publicly, reproducibly):

**Frame time (ms)**

• Metric: Frame time (ms)

• How: performance.now() + GPUCommandBuffer timestamps

• Why: Core perf

**99th percentile frame time**

• Metric: 99th percentile frame time

• How: Sorted array, p99 index

• Why: Smoothness

**GPU memory (bytes)**

• Metric: GPU memory (bytes)

• How: adapter.requestAdapterInfo() + buffer/texture size

• Why: Efficiency

**Time to first frame**

• Metric: Time to first frame

• How: performance.now() from click to first render

• Why: UX

**FPS under rotation**

• Metric: FPS under rotation

• How: Continuous orbit, log 60s window

• Why: Real-world

**Slab thickness scaling**

• Metric: Slab thickness scaling

• How: MPR with slab 1→64 slices, measure frame time

• Why: Feature perf

Benchmark protocol:
1. Load exact same volume in all viewers
2. Same camera position (export matrix, apply to OHIF/VTK.js)
3. Run 1000 frames of continuous orbit
4. Export CSV → generate charts with Chart.js or Python/matplotlib

Public datasets (TCIA, citable): (2/4)
[10.05.2026 14:28] Toretto Bot: - NSCLC-Radiomics — chest CT, ~512×512×300, anonymized
- CT-ORG — 140 CT scans with organ labels
- TCGA-GBM — brain MRI (T1, T2, FLAIR)

Never use private/anon data in benchmarks. Reviewers will dismiss it.

---

📅 8-Week Timeline

Week 1–2: Foundation
- [ ] Vite + TypeScript + WebGPU scaffold
- [ ] GPU device init with capability logging
- [ ] Python preprocess-dicom.py: pydicom → raw volume + metadata JSON
- [ ] Load raw volume → GPUTexture3D upload
- [ ] First compute shader: output solid color from compute to canvas
- [ ] Camera: orbit + zoom with mouse
- Deliverable: Empty volume rotates on screen via WebGPU compute

Week 3–4: Core Rendering
- [ ] Raycasting compute shader (ray-box intersect + front-to-back compositing)
- [ ] Transfer function as 1D texture LUT
- [ ] Window/Level controls (mouse drag)
- [ ] Basic 3D volume rendering working end-to-end
- Deliverable: "I can see a brain/lung in my browser"

Week 5–6: MPR + Polish
- [ ] MPR compute shader: axial, sagittal, coronal
- [ ] Slab thickness control (min/max/avg projection)
- [ ] 3-up viewport (3D + MPRs side by side)
- [ ] Transfer function editor UI (canvas click-to-add-points)
- [ ] Perf overlay (FPS, GPU time, memory)
- Deliverable: Feature-complete MVP viewer

Week 7: Benchmarks
- [ ] Benchmark runner: automated frame time collection
- [ ] Setup OHIF + VTK.js comparison with same dataset
- [ ] Run benchmarks on 3 hardware configs (integrated GPU, discrete GPU, M-series Mac)
- [ ] Generate charts, document results
- Deliverable: Reproducible benchmark suite with published results

Week 8: Ship It
- [ ] Clean README with architecture diagram
- [ ] Blog post draft (the "Why OHIF Crashes on Large CT Scans" angle)
- [ ] HN submission prep
- [ ] Recruit message: short, link to benchmarks, no pitch
- Deliverable: Public repo + blog + benchmarks

---

⚠️ Pitfalls (hard-earned lessons)

Don't do this:
1. Don't reinvent DICOM parsing — pydicom preprocess is the right call, parse once in Python, render in browser. Parsing multi-frame compressed DICOM in JS is a 6-month rabbit hole.
2. Don't claim "WebGPU wins" — document where it loses (Safari gaps, mobile GPU texture limits, compute workgroup overhead on simple volumes). Honesty is the differentiator.
3. Don't compare feature-to-feature with OHIF — you don't have segmentation, AI, PACS. Compare only volume render perf + MPR. Like-for-like.
4. Don't gold-plate the UI — clean minimal viewer > fancy UI with mediocre rendering. The benchmarks ARE the product.
5. Don't use private datasets — TCIA only, full citation in README.
6. Don't build on dawn Rust bindings — stay pure WebGPU browser API. The whole point is "runs in Chrome/Firefox, no install."

Watch out for:
- WebGPU texture limits — integrated GPUs max 8192³ for 2D, but 3D textures are usually 2048³. Downsample volumes if needed.
- Safari WebGPU is Tech Preview — document exact browser versions. Don't claim Safari support unless you tested it.
- Chrome 142 WebGL regression — your OHIF comparison should note this to be fair.
- GPU timestamp queries — some implementations have issues with writeTimestamp. Fallback to performance.now() if needed.

---

📧 Recruit Message (one-shot, after benchmarks are live)

 Hi [name], I noticed the Doha role calls for WebGPU + volume rendering. I published a browser-based DICOM renderer with benchmarks against OHIF/Cornerstone3D last week — [link]. Happy to walk through the architecture if there's interest.

That's it. No pitch. The artifact speaks for itself.

---

🔑 Key Differentiators vs Competitors

Browser + WebGPU

• : Browser + WebGPU

• Ossium: ✅

• BioLens: ❌ WebGL

• OrthoRay: ❌ native

• OHIF: ❌ WebGL

• You: ✅

Benchmark suite

• : Benchmark suite

• Ossium: ❌

• BioLens: ❌

• OrthoRay: ❌

• OHIF: ❌

• You: ✅
 (3/4)
[10.05.2026 14:28] Toretto Bot: MPR + slab control

• : MPR + slab control

• Ossium: ❌

• BioLens: ❌

• OrthoRay: ✅

• OHIF: ✅

• You: ✅

Transfer fn editor

• : Transfer fn editor

• Ossium: ❌ CLI

• BioLens: ✅

• OrthoRay: ✅

• OHIF: Partial

• You: ✅

Reproducible datasets

• : Reproducible datasets

• Ossium: ❌

• BioLens: ❌

• OrthoRay: ❌

• OHIF: ❌

• You: ✅

Head-to-head comparison

• : Head-to-head comparison

• Ossium: ❌

• BioLens: ❌

• OrthoRay: ❌

• OHIF: ❌

• You: ✅

Nobody has done #2, #6, and #7. That's your moat.

