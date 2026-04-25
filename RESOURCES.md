[10.05.2026 15:56] Toretto Bot: Here's the full tech stack with references:

---

🔧 Tech Stack — WebGPU DICOM Volume Renderer

Core Technologies

1. WebGPU API
The browser GPU interface — compute shaders, render pipelines, texture management.

W3C Spec (official)

• Resource: W3C Spec (official)

• URL: https://www.w3.org/TR/webgpu/

webgpu.org (overview + links)

• Resource: webgpu.org (overview + links)

• URL: https://webgpu.org/

MDN WebGPU API Reference

• Resource: MDN WebGPU API Reference

• URL: https://developer.mozilla.org/en-US/Web/API/WebGPU_API

Chrome WebGPU status

• Resource: Chrome WebGPU status

• URL: https://developer.chrome.com/docs/capabilities/webgpu

Apple WWDC25 — Unlock GPU Computing with WebGPU

• Resource: Apple WWDC25 — Unlock GPU Computing with WebGPU

• URL: https://developer.apple.com/videos/play/wwdc2025/236/

2. WGSL (WebGPU Shading Language)
Your shader language — all compute and render shaders will be written in WGSL.

W3C Spec (official)

• Resource: W3C Spec (official)

• URL: https://www.w3.org/TR/WGSL/

Tour of WGSL (interactive)

• Resource: Tour of WGSL (interactive)

• URL: https://www.w3.org/TR/WGSL/

WebGPU Fundamentals — Compute Shaders

• Resource: WebGPU Fundamentals — Compute Shaders

• URL: https://webgpufundamentals.org/webgpu/lessons/webgpu-compute-shaders.html

WebGPU Fundamentals — Fundamentals

• Resource: WebGPU Fundamentals — Fundamentals

• URL: https://webgpufundamentals.org/webgpu/lessons/webgpu-fundamentals.html

Compute Shaders Crash Course (YouTube)

• Resource: Compute Shaders Crash Course (YouTube)

• URL: https://www.youtube.com/watch?v=47bgA5TQwmc

3. TypeScript
Language for the entire project.

TypeScript Handbook

• Resource: TypeScript Handbook

• URL: https://www.typescriptlang.org/docs/handbook/

TS + WebGPU type definitions

• Resource: TS + WebGPU type definitions

• URL: Built into lib.dom.d.ts (no extra types needed for Chrome 113+)

4. Vite
Dev server + bundler — fast HMR, TypeScript native.

Vite docs

• Resource: Vite docs

• URL: https://vitejs.dev/

Vite + TypeScript template

• Resource: Vite + TypeScript template

• URL: npm create vite@latest -- --template vanilla-ts

---

DICOM Pipeline

5. pydicom (Python)
DICOM file parsing — used in preprocessing step (Python → raw volume).

pydicom docs

• Resource: pydicom docs

• URL: https://pydicom.github.io/

Pixel data tutorial

• Resource: Pixel data tutorial

• URL: https://pydicom.github.io/pydicom/dev/tutorials/pixel_data/introduction.html

Reading DICOM series

• Resource: Reading DICOM series

• URL: https://pydicom.github.io/pydicom/stable/tutorials/dataset_basics.html

GitHub

• Resource: GitHub

• URL: https://github.com/pydicom/pydicom

6. NumPy
Volume manipulation, Hounsfield unit conversion, downsampling.

NumPy docs

• Resource: NumPy docs

• URL: https://numpy.org/doc/stable/

np.frombuffer + np.memmap

• Resource: np.frombuffer + np.memmap

• URL: https://numpy.org/doc/stable/reference/generated/numpy.memmap.html

7. SimpleITK (optional, for series loading)
Load entire DICOM folders as 3D volumes with correct spacing/orientation.

SimpleITK docs

• Resource: SimpleITK docs

• URL: https://simpleitk.readthedocs.io/

Reading DICOM series

• Resource: Reading DICOM series

• URL: https://simpleitk.readthedocs.io/en/master/Examples/DicomSeriesReader/Documentation.html

---

Preprocessing Script

8. Python (preprocessing only)
Not for the browser app — just to convert DICOM → .raw + .json metadata.

pydicom

• Tool: pydicom

• Purpose: Parse DICOM files, extract pixel data

numpy

• Tool: numpy

• Purpose: Volume array manipulation, HU conversion, downsampling

json (stdlib)

• Tool: json (stdlib)

• Purpose: Export metadata (dimensions, spacing, modality)

struct (stdlib)

• Tool: struct (stdlib)

• Purpose: Write raw binary volume data

---
 (1/3)
[10.05.2026 15:56] Toretto Bot: Public Datasets (for benchmarks)

9. The Cancer Imaging Archive (TCIA)
Public, citable, anonymized CT/MRI volumes.

NSCLC-Radiomics

• Dataset: NSCLC-Radiomics

• Description: Chest CT, ~512×512×300

• URL: https://www.cancerimagingarchive.net/

CT-ORG

• Dataset: CT-ORG

• Description: 140 CT scans with organ labels

• URL: https://www.cancerimagingarchive.net/collection/ct-org/

TCGA-GBM

• Dataset: TCGA-GBM

• Description: Brain MRI (T1, T2, FLAIR)

• URL: Browse via TCIA

NCI Imaging Data Commons

• Dataset: NCI Imaging Data Commons

• Description: Cloud-based cancer imaging repo

• URL: https://datacommons.cancer.gov/repository/imaging-data-commons

10. GitHub LFS
Store sample .raw volumes in the repo for reproducibility.

Git LFS docs

• Resource: Git LFS docs

• URL: https://git-lfs.com/

LFS setup

• Resource: LFS setup

• URL: https://docs.github.com/en/repositories/working-with-files/managing-large-files

---

Competitor References (what you're benchmarking against)

11. OHIF Viewer
The incumbent — WebGL-based, production-grade.

OHIF GitHub

• Resource: OHIF GitHub

• URL: https://github.com/OHIF/Viewers

OHIF docs

• Resource: OHIF docs

• URL: https://docs.ohif.org/

WebGL context lost bug (Chrome 142)

• Resource: WebGL context lost bug (Chrome 142)

• URL: https://github.com/OHIF/Viewers/issues/5603

Large series rendering bug (2800+ frames)

• Resource: Large series rendering bug (2800+ frames)

• URL: https://github.com/OHIF/Viewers/issues/4470

Performance issues thread

• Resource: Performance issues thread

• URL: https://community.ohif.org/t/performance-issues-with-ohif-viewer-compared-to-demo/1856

12. Cornerstone3D
OHIF's rendering engine — what you're directly competing with on performance.

Cornerstone3D docs

• Resource: Cornerstone3D docs

• URL: https://cornerstonejs.org/docs/getting-started/overview/

GitHub

• Resource: GitHub

• URL: https://github.com/cornerstonejs/cornerstone3D

13. VTK.js
Kitware's web visualization toolkit — WebGPU on roadmap (Q4 2026 for v10).

VTK.js GitHub

• Resource: VTK.js GitHub

• URL: https://github.com/Kitware/vtk-js

VTK.js WebGPU examples

• Resource: VTK.js WebGPU examples

• URL: https://kitware.github.io/vtk-js/docs/develop_webgpu.html

VTK WebGPU roadmap

• Resource: VTK WebGPU roadmap

• URL: https://discourse.vtk.org/t/vtk-webgpu-roadmap/13749

VTK.js v35 release

• Resource: VTK.js v35 release

• URL: https://www.kitware.com/vtk-js-v35-release/

14. Ossium (direct competitor)
WebGPU DICOM renderer in TypeScript — academic project, 13 stars.

GitHub

• Resource: GitHub

• URL: https://github.com/fraserlove/ossium

Languages

• Resource: Languages

• URL: TypeScript 69% + WGSL 18%

15. BioLens
Babylon.js volumetric DICOM viewer — WebGL2, not WebGPU.

App

• Resource: App

• URL: https://biolens.buva.io/

Reddit post

• Resource: Reddit post

• URL: https://www.reddit.com/r/GraphicsProgramming/comments/1p82djf/

Babylon.js forum

• Resource: Babylon.js forum

• URL: https://forum.babylonjs.com/t/volumetric-visualization-app-for-medical-scans-biolens/61537

16. OrthoRay
Rust + Tauri + wgpu — native desktop, not browser. Built by a surgeon.

Website

• Resource: Website

• URL: https://orthoarchives.com/en/orthoray

HN discussion

• Resource: HN discussion

• URL: https://news.ycombinator.com/item?id=46949048

Rust forum thread

• Resource: Rust forum thread

• URL: https://users.rust-lang.org/t/real-time-medical-imaging-with-rust-wgpu-is-this-an-underexplored-niche/138189

Microsoft Store

• Resource: Microsoft Store

• URL: https://apps.microsoft.com/detail/9p1sh436c1tq

---

GPU Debugging & Profiling

17. Chrome DevTools + WebGPU Inspector
Built into Chrome — GPU frame debugger, shader editor, texture viewer.

Chrome DevTools WebGPU

• Resource: Chrome DevTools WebGPU
 (2/3)
[10.05.2026 15:56] Toretto Bot: • URL: https://developer.chrome.com/docs/devtools/application/panels

chrome://flags/#enable-unsafe-webgpu

• Resource: chrome://flags/#enable-unsafe-webgpu

• URL: Enable experimental features

GPU Process internals

• Resource: GPU Process internals

• URL: chrome://gpu/

18. RenderDoc (for native wgpu, if you port later)
Frame capture and GPU debugging for Vulkan/Metal/D3D12.

RenderDoc

• Resource: RenderDoc

• URL: https://renderdoc.org/

---

Benchmarking & Charting

19. Chart.js (browser-side charts for benchmarks)
Quick perf overlay + benchmark result visualization.

Chart.js docs

• Resource: Chart.js docs

• URL: https://www.chartjs.org/

20. Python + matplotlib (offline benchmark charts)
Generate publication-quality benchmark charts from JSON results.

matplotlib

• Resource: matplotlib

• URL: https://matplotlib.org/

---

Complete Tech List (summary)

**Language (browser)**

• Layer: Language (browser)

• Technology: TypeScript

• Version/Notes: 5.x

**Bundler**

• Layer: Bundler

• Technology: Vite

• Version/Notes: 6.x

**GPU API**

• Layer: GPU API

• Technology: WebGPU

• Version/Notes: W3C spec, Chrome 113+ stable

**Shader language**

• Layer: Shader language

• Technology: WGSL

• Version/Notes: W3C spec

**DICOM parsing**

• Layer: DICOM parsing

• Technology: pydicom

• Version/Notes: 3.x (Python preprocessing only)

**Volume manipulation**

• Layer: Volume manipulation

• Technology: NumPy

• Version/Notes: (Python preprocessing only)

**Volume loading (optional)**

• Layer: Volume loading (optional)

• Technology: SimpleITK

• Version/Notes: For full DICOM series

**Canvas rendering**

• Layer: Canvas rendering

• Technology: HTML Canvas API

• Version/Notes: For TF editor, UI overlays

**Benchmarks**

• Layer: Benchmarks

• Technology: performance.now() + GPU timestamps

• Version/Notes: Chrome only for now

**Charts**

• Layer: Charts

• Technology: Chart.js or matplotlib

• Version/Notes: Perf overlay + blog

**Storage**

• Layer: Storage

• Technology: Git LFS

• Version/Notes: For public sample datasets

**Target browser**

• Layer: Target browser

• Technology: Chrome 113+ (stable)

• Version/Notes: Primary. Safari TP as secondary

**Target browser (fallback)**

• Layer: Target browser (fallback)

• Technology: Firefox Nightly

• Version/Notes: WebGPU behind flag

**Competitor benchmarks**

• Layer: Competitor benchmarks

• Technology: OHIF 3.9, Cornerstone3D 2.0, VTK.js v35

• Version/Notes: Same-volume tests

---

Want me to save this as a file in your project or keep it here? (3/3)
