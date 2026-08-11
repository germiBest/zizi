# Optimizing a WebGPU DICOM Volume Renderer: 18ms → 6ms on a 250MB CT

A 250MB chest CT lives in a 512×512×501 volume of signed 16-bit voxels. A modern medical viewer shows it
in a 3D direct-volume render (DVR) plus three orthogonal MPR slice planes (axial, sagittal, coronal),
interactively, in a browser, with no install. The renderer ships zero pixels through a network because
all four canvases are computed entirely on the GPU each frame.

This is the perf story of getting that scenario from **18 ms of GPU time per frame down to ~6 ms** — a
~3× speedup that turned a ~55fps demo into a vsync-locked 60fps app with headroom for retina DPR. Real
WebGPU, real medical data, three rounds of optimization, before/after numbers, and one optimization
(the occupancy grid) that should be in every WebGPU volume renderer.

> The renderer is [zizi](https://github.com/...) — TypeScript + WebGPU compute, no WebGL fallback.
> Profiled on Apple Silicon (M2-class, `apple · metal-3` adapter) via headless Chromium with
> Playwright. Raw benchmark JSON in `bench-results/`. Commit at time of writing: `65b9db8` plus
> uncommitted occupancy-grid work.

---

## The setup

The compute pipeline is four passes per frame:

| pass | what | output |
|---|---|---|
| `raycast` | 3D DVR/MIP/MinIP/Avg compositing through the volume | rgba8 storage texture |
| `mpr-axial` | 2D slab through Z axis | rgba8 storage texture |
| `mpr-sagittal` | 2D slab through X axis | rgba8 storage texture |
| `mpr-coronal` | 2D slab through Y axis | rgba8 storage texture |
| `display` (×4) | blit storage texture → canvas | swapchain |

A `Renderer.tick(dt, snapshot)` is called per canvas per `requestAnimationFrame`. Each pass declares
WebGPU compute pass timestamp writes, and `Timestamps.pollReadback()` maps the resolved query buffer
async — so we get per-pass GPU times to within a few microseconds, every frame, with negligible
overhead.

Volume storage is `r16float` 3D texture. CT HU values (signed 12-bit, range −1024…+3071) are packed
to `f16` at upload time. The texture takes ~250 MB; on this GPU's 256MB max-buffer cap, it just fits.

The TF (transfer function) is a 256-wide 2D RGBA texture, dynamically rebuilt from a `TransferFn`
object whenever the preset or W/L (window/level) changes.

A typical default scenario:
- Dataset: 263 MB contrast CT (`ct-contrast`)
- TF: "soft" clinical preset (W=400, C=40 → visible HU [−160, +240])
- Camera: orbit auto-spinning at 0.25 rps for consistent frame load
- Viewport: 1440×900 → 3D canvas 720×305 → ~220k rays at DPR=1

---

## Profile zero: where the time goes

Bench output before any optimization:

```
pass            mean GPU   % of frame
raycast (3D)    17.10 ms    87 %
mpr-axial        1.13 ms     6 %
mpr-sagittal     0.94 ms     5 %
mpr-coronal      0.19 ms     1 %
display (×4)     ~0   ms     0 %
---
total CPU        0.31 ms
total GPU       18.50 ms   ←  55 fps
```

The 3D raycast pass is **87% of frame time**. Anything else is rounding error.

Inside that pass: at 384 steps per ray × 220k rays = 84M voxel fetches per frame. Plus a per-step TF
lookup, plus 6-tap gradient samples when shading is on (under an α-conditional). The cost per
megapixel is **86 ms/Mpx**. At retina DPR=2 (4× the pixel count), this scales to ~340 ms/frame —
nowhere near interactive.

So the optimization target is clear: the raycast pass, and specifically the per-step inner loop.

> **Lesson 1.** Don't optimize what the timestamp doesn't say is slow. The MPR passes here
> were never the problem; spending time on them would have moved nothing.

---

## Round 1: low-hanging fruit (no new data structures)

Three changes in the raycast shader/uniforms, each <20 lines.

### 1.1. Pre-bake W/L into uniforms

The old inner loop did this:

```wgsl
let level = uni.wl.x;
let widthRaw = uni.wl.y;
let widthSafe = max(widthRaw, 1.0);
let lowVisible = level - widthRaw * 0.5;

// ... per step:
let normWl = clamp((hu - lowVisible) / widthSafe, 0.0, 1.0);
```

The per-step **division by `widthSafe`** is expensive on GPUs. Hoist + invert on the CPU once per
frame:

```ts
const widthSafe = Math.max(widthRaw, 1);
u[32] = level - widthRaw * 0.5;     // lowVisible
u[33] = 1 / widthSafe;              // invWidth
u[34] = level + widthRaw * 0.5;     // upperVisible
u[35] = u[32];                       // lowerVisible (same as lowVisible)
```

```wgsl
let normWl = clamp((hu - lowVisible) * invWidth, 0.0, 1.0);
```

A subtract + multiply instead of a subtract + divide. Trivial. The shader compiler *could* hoist
this, but in practice it didn't.

### 1.2. Lower STEP_COUNT for projection modes

DVR is doing front-to-back compositing, so it needs Nyquist-rate sampling (one step per voxel
roughly) to avoid undersampling translucent gradients. MIP/MinIP/Avg accumulate scalars — they
don't have a Nyquist constraint, and 256 steps through the volume is enough to find the extremum
or compute a good-enough average.

```ts
const STEP_COUNT_DVR = 384;
const STEP_COUNT_PROJ = 256;
u[28] = mode === 'dvr' ? STEP_COUNT_DVR : STEP_COUNT_PROJ;
```

33% fewer iterations in MIP/MinIP/Avg, ~33% raycast time saved for those modes.

### 1.3. Saturation-break for MIP/MinIP

For MIP, once `acc >= upperVisible`, the final TF lookup will clamp to 1 regardless of any future
sample. No reason to keep marching. Same for MinIP at `lowerVisible`.

```wgsl
if (renderMode == 1u) {  // MIP
  acc = max(acc, hu);
  if (acc >= upperVisible) { break; }
} else if (renderMode == 2u) {  // MinIP
  acc = min(acc, hu);
  if (acc <= lowerVisible) { break; }
}
```

For CT with a "soft" TF (visible window starts at −160 HU), MinIP triggers the break on the very
first air voxel a ray crosses — typically within 3 samples. **52× speedup on MinIP** from this
one line.

### Round 1 results

| mode | before | after R1 | speedup |
|---|---|---|---|
| DVR shaded | 17.10 | **12.48** | 1.37× |
| DVR unshaded | 15.65 | **10.71** | 1.46× |
| MIP | 24.54 | **8.69** | 2.82× |
| MinIP | 25.56 | **0.49** | **52×** |
| Avg | 23.67 | **11.51** | 2.06× |

Frame time went from 18.5ms → ~14ms. All modes now hit vsync 60fps. But the 3D raycast is still
~13ms — most of the budget — and at retina that's still too much.

> **Lesson 2.** Per-step divides cost more than per-step multiplies, even on GPUs. Always inline
> reciprocals when you can compute them once.
> **Lesson 3.** Early termination is the cheapest optimization. If a sample can't change the
> final result, don't take it.

---

## Round 2: the real win — TF-aware occupancy grid

This is the classic optimization every production volume renderer ships, and it deserves a careful
WebGPU writeup because the WebGPU community hasn't covered it well.

### The idea

A CT volume is mostly air. With a "soft" TF clipping anything below −160 HU to α=0, **40–60% of
the rays through a chest CT spend significant path inside fully-invisible regions**. The raycast
shader still samples them all because it has no idea what's where.

Build a coarse "is this region invisible?" lookup once per volume, query it before each sample,
and skip whole blocks of empty space in a single jump.

### Design choices

**Block size: 8 voxels.** For 512×512×501 → 64×64×63 = 258k cells. ~2 MB at `rgba16float`. Tiny.

**Single-stage build.** The textbook version is a two-stage build: scan the volume into a
min/max grid (slow), then run a TF-test pass that writes a 1-bit "occupied" texture (fast). The
"occupied" texture is rebuilt on every TF/WL change. **We don't do that.**

Instead:
- **Build the min/max grid once per volume bundle** (or pyramid level swap). This is the slow part:
  one scan over the 128M voxels.
- **Test visibility inline in the raycast shader**, using the existing `lowVisible`/`upperVisible`
  uniforms. No second build pass. No invalidation logic on TF/WL change.

The inline test is two comparisons:

```wgsl
let mm = textureLoad(minmaxGrid, cellCoord, 0);
if (mm.g < lowVisible) { ... skip ... }   // blockMax below window: invisible
```

That's cheaper than rebuilding an occupancy texture, and W/L drag stays buttery (the W/L drag was
the original reason to *not* recompute the volume on every state change).

### The build pass

One workgroup per cell. 64 threads (8×8×1), each iterating 8 z-slices. Tree-reduce local min/max
in workgroup-shared memory:

```wgsl
@group(0) @binding(0) var volume: texture_3d<f32>;
@group(0) @binding(1) var grid: texture_storage_3d<rgba16float, write>;

var<workgroup> sMin: array<f32, 64>;
var<workgroup> sMax: array<f32, 64>;

@compute @workgroup_size(8, 8, 1)
fn cs_build(@builtin(local_invocation_id) lid: vec3<u32>,
            @builtin(workgroup_id) wid: vec3<u32>) {
  let origin = wid * 8u;
  var lmin: f32 = 1.0e30;
  var lmax: f32 = -1.0e30;
  for (var k: u32 = 0u; k < 8u; k = k + 1u) {
    let v = origin + vec3<u32>(lid.x, lid.y, k);
    if (all(v < textureDimensions(volume))) {
      let hu = textureLoad(volume, vec3<i32>(v), 0).r;
      lmin = min(lmin, hu);
      lmax = max(lmax, hu);
    }
  }
  let li = lid.x + lid.y * 8u;
  sMin[li] = lmin; sMax[li] = lmax;
  workgroupBarrier();

  // Tree-reduce 64 → 1
  if (li < 32u) { sMin[li] = min(sMin[li], sMin[li+32u]); sMax[li] = max(sMax[li], sMax[li+32u]); }
  workgroupBarrier();
  if (li < 16u) { sMin[li] = min(sMin[li], sMin[li+16u]); sMax[li] = max(sMax[li], sMax[li+16u]); }
  // ... 8, 4, 2 ...
  if (li == 0u) {
    textureStore(grid, vec3<i32>(wid),
                 vec4<f32>(min(sMin[0], sMin[1]), max(sMax[0], sMax[1]), 0.0, 0.0));
  }
}
```

258k workgroups × 64 threads — modern GPUs eat this in single-digit milliseconds. **One-shot cost
per volume load.** Pyramid level swaps trigger a rebuild via a `bundle.view !== seenBundleView`
check in the rAF loop — no event plumbing needed.

WebGPU specifics worth noting:
- `texture_storage_3d<rgba16float, write>` is in Tier 1 (core) of WebGPU storage formats since
  2024. No feature flag.
- `textureLoad` on a `texture_3d<f32>` returns the f16 sample as f32. The build pass and the
  raycast shader both consume the volume this way.
- `var<workgroup> ... workgroupBarrier()` is the standard reduction pattern; works identically
  on Apple Metal, Vulkan, and DX12 backends.

### The skip in the raycast shader

Compute K (steps-per-cell) once per ray, then check the grid per step:

```wgsl
let cellDimsU = textureDimensions(minmaxGrid);
let cellDims = vec3<f32>(cellDimsU);
let cellWorldSize = (bMax - bMin) / cellDims;
let cellMinAxis = min(min(cellWorldSize.x, cellWorldSize.y), cellWorldSize.z);
let skipSteps = max(u32(floor(cellMinAxis / dt)), 1u);

// inside DVR loop:
let cellCoord = clamp(vec3<i32>(n * cellDims), vec3<i32>(0), vec3<i32>(cellDimsU) - vec3<i32>(1));
let mm = textureLoad(minmaxGrid, cellCoord, 0);
if (mm.g < lowVisible) {
  i = i + skipSteps - 1u;  // -1 because for-loop adds 1
  continue;
}
// ... normal sample
```

For our CT, `skipSteps ≈ 3` — each empty cell skips 3 inner-loop iterations. Conservative: we use
`min(cellWorldSize)` to ensure we never overshoot an occupied cell (which would cause visible holes
in dense tissue).

### Per-mode skip criteria

| mode | skip condition | rationale |
|---|---|---|
| DVR | `blockMax < lowVisible` | No HU in block produces visible α (monotone TF anchored at α=0 below `lowVisible`) |
| MIP | `blockMax < lowVisible` | Block max can't push acc into visible range; "above" blocks fall through to existing saturation break |
| MinIP | `blockMin > upperVisible` | Symmetric — block min can't pull acc into visible range |
| Avg | (no skip) | Avg sums all samples and divides by step count; skipping breaks the denominator |

That last row matters: **Avg has no safe skip**. Avg also regressed slightly after this round
because it pays the per-ray setup (one extra `textureDimensions` + ALU) without benefit. Future
work: tracked-step Avg (count actual sampled steps, divide by *that*).

### Round 2 results

```
mode          baseline   after R1   after R2 (occ-grid)   cumulative
DVR shaded     17.10      12.48        5.52                3.10×
DVR unshaded   15.65      10.71        4.01                3.90×
MIP            24.54       8.69        6.19                3.96×
MinIP          25.56       0.49        0.58               44.07×
Avg            23.67      11.51       16.83                1.41× (regressed)
```

Frame time: **18.5ms → 7.5ms on DVR shaded (`ct-contrast`)**. The 3D raycast went from 87% of
frame to ~73% — still dominant but no longer the existential problem.

> **Lesson 4.** Occupancy grids on WebGPU are easier than they look. The classic two-stage
> design (min/max + occupancy) was designed for OpenGL where shader branching was cheap relative
> to texture sampling. On WebGPU you can collapse to a single stage with a runtime visibility
> test — no rebuild on W/L drag. Saves complexity *and* matches user UX better.

---

## Mobile profile

CDP-emulated iPhone 14 Pro spec: viewport 393×852 CSS, `deviceScaleFactor: 3`, CPU throttle 4×.

We can't directly throttle the GPU in CDP. But Apple Silicon's GPU dynamically scales clocks
based on load — under CPU throttle, the GPU under-clocks too, which roughly approximates a
"mobile GPU class" at ~3× per-pixel cost.

| mode | desktop | mobile-emulated | delta |
|---|---|---|---|
| DVR shaded (raycast) | 5.52 | 7.15 | +30% |
| DVR shaded (totalGPU) | 7.54 | 9.31 | +23% |
| MIP (raycast) | 6.19 | 7.32 | +18% |
| MinIP (raycast) | 0.58 | 0.84 | +45% |
| Avg (raycast) | 16.83 | 22.64 | +35% |
| Frame dt mean | 16.6 | 16.6 (vsync) | — |
| FPS | 60 | 60 (Avg 40) | — |

Two things to note:

1. **Smaller 3D canvas on mobile.** The surface caps at `maxDpr=1.5`. CSS canvas at 196×280 × 1.5
   = 294×420 = 123k pixels (vs 220k desktop). Net pixels are smaller despite DPR=3.
2. **Per-pixel cost is ~3× higher on mobile.** Apple GPU under-clock from CPU throttle. The raw
   pixel cost went from ~18 ms/Mpx (desktop) to ~56 ms/Mpx (mobile-emulated).

Result: **all 4 main modes (DVR + MIP + MinIP + DVR unshaded) hit vsync 60fps on emulated mobile.
Avg drops to ~40 fps** because of its no-skip nature.

CPU was never a problem: 0.3 ms desktop → 0.7 ms mobile under 4× throttle. We have ~15 ms of CPU
budget on every frame.

---

## TF preset sensitivity: what the optimization is *worth*

The occupancy grid's payoff depends entirely on how much of the volume is invisible. Test the
same camera/dataset (`ct-contrast`, DVR shaded) with four different TF presets:

| preset | W/L | visible HU window | raycast ms | skip benefit |
|---|---|---|---|---|
| `lung` | 1500/−600 | [−1350, +150] | **15.81** | near-zero |
| `bone` | 1500/+300 | [−450, +1050] | **12.57** | small |
| `soft` | 400/+40 | [−160, +240] | **5.38** | 3× |
| `brain` | 80/+40 | [0, +80] | **5.44** | 3× |

The lung preset has a 1500 HU window centered at −600 — it includes air (−1000), so almost every
cell in the volume passes the visibility test. The optimization is useless. Soft and brain
presets have narrow windows that exclude most of the volume — the skip fires frequently.

The art is that **the optimization is "free" when not useful** — the cost is 1 extra texture
sample per step, but that's amortized across the savings when blocks *are* invisible. On lung TF
we pay a small premium with no payoff; we're not losing visible fps, just not gaining.

This is the article's most important practical insight: **measure your TF presets when judging
an optimization's value**. Lung's worst case is what you'd benchmark against; soft's best case
is what you'd cite in a marketing chart. The truth is bimodal.

---

## Volume size scaling

Same DVR + shaded + "soft" TF, three datasets:

| dataset | extent | size | desktop ms | mobile ms |
|---|---|---|---|---|
| phantom-128 | 128³ | 4 MB | 2.24 | 2.52 |
| ct-thin | 512×512×195 | 98 MB | 3.23 | 3.02 |
| ct-contrast | 512×512×501 | 251 MB | 5.52 | 7.15 |

Cost roughly scales with the longest volume axis (which determines ray length × samples), not
total voxel count. The 512³ ct-contrast has 4× the voxels of ct-thin but only ~1.7× the cost.

The mobile/desktop crossover on `ct-thin` is interesting: at this size, mobile is *faster than
desktop* because the surface caps at 1.5× DPR — the actual rendered pixel count is smaller. For
ct-contrast (where occupancy skip pays off less in absolute time), mobile loses to desktop by
~30%. Same hardware, two different stories from the texture footprint.

---

## Where time still goes

After all rounds, the breakdown on `ct-contrast` desktop DVR shaded:

```
pass             mean GPU   % of frame
raycast (3D)      5.52 ms     73 %
mpr-axial         0.85 ms     11 %
mpr-sagittal     ~0.8 ms      11 %
mpr-coronal      ~0.4 ms       5 %
display × 4      ~0 ms         0 %
---
total CPU         0.30 ms
total GPU         7.54 ms   ← vsync 60fps comfortable
```

The raycast is still 3/4 of the frame; the rest are MPRs. Now both are within striking distance
of further optimization — the next round (adaptive resolution, dirty-flag MPR, mip-volume late
sampling) would push DVR to ~3 ms and skip MPRs entirely when only the 3D viewport is moving.

---

## Lessons, condensed

1. **WebGPU's `timestampWrites` are gold.** Sub-millisecond per-pass timing, zero overhead, no
   query buffer plumbing visible to the user. Use them from day one.

2. **Hoist per-step ALU as far up as it'll go.** The W/L bake was the cheapest 30% we've ever
   gotten. Divisions are the worst per-step op on the GPU.

3. **Sample the *cheapest* texture in your inner loop, not the most informative one.** The
   occupancy grid trades 1 cell sample for skipping 3 voxel samples — net savings even before
   you factor in the math, the TF lookup, and the gradient.

4. **Don't rebuild on every state change if you can test inline.** The classic two-stage
   "min/max + occupancy" design is wrong for interactive volume rendering with W/L drag.
   Single-stage with a runtime test is simpler and matches the UX.

5. **Profile with the real TF you'll ship with.** Optimization value is preset-dependent. The
   lung preset gets ~0% from empty-space skipping; the soft preset gets 3×. Both are correct.

6. **Mobile isn't where you think it is.** CPU throttle costs us almost nothing because the
   renderer is GPU-bound. The mobile GPU class (proxied via Apple's under-clock under load) is
   the constraint — and even there, vsync 60fps for the main modes is achievable.

7. **Avg is the hardest projection mode to optimize.** No early termination, no safe skip
   without changing the denominator. If you need fast Avg, you need either tracked-step
   semantics or a custom shader path.

---

## What's next

Round 3 candidates, in priority order:

- **Adaptive resolution during interaction.** Drop 3D canvas to 0.5× scale during camera motion,
  restore on idle. 4× speedup during orbit/drag. Standard production trick.
- **Dirty-flag MPR.** Re-render only when slab/slice/TF/WL/bundle changes. Saves ~2 ms when the
  user is only rotating 3D.
- **Tracked-step Avg.** Count actual sampled steps inside the loop, divide by that. Restores
  Avg to ~5 ms on desktop and unlocks 60fps on mobile.
- **Mip-volume late-ray sampling.** Once accumulated α > 0.6, sample from a 256³ mip of the
  volume. ~15% additional DVR speedup, ~64MB extra texture.
- **Specialized pipelines per mode.** Compile 4 raycast pipelines (DVR/MIP/MinIP/Avg) instead
  of one branched. Removes the inner-loop `if (renderMode == N)`. ~5% on projection modes.

All compound. None of them require rewriting the structure we have. The renderer's `Pass`
interface and the `RenderMode` enum make each one a contained change.

---

## Reproducing

All numbers in this article come from raw JSON in `bench-results/`:

```
bench-results/
├── desktop_ct-contrast_soft.json          ← main desktop scenario
├── desktop_ct-thin_soft.json
├── desktop_phantom-128_soft.json
├── desktop_ct-contrast_tf-sensitivity.json ← TF preset comparison
├── mobile_ct-contrast_soft.json            ← + iPhone 14 emulation (CDP)
├── mobile_ct-thin_soft.json
├── mobile_phantom-128_soft.json
└── summary.json                             ← consolidated view
```

Each file holds env metadata + per-mode stats (mean / p50 / p95 / p99 for raycast_ms,
totalGpu_ms, totalCpu_ms, frameDt_ms). 180-frame samples, auto-spin camera, 1.5s warmup.

The history table is reconstructed from earlier session captures; round-1 and pre-round-1
numbers come from the commit progression (`git log --oneline`). Re-running with the working
tree reverted to those commits would reproduce them within Apple-GPU-frequency noise.

> **Caveat:** Apple Silicon scales GPU clocks dynamically. Single-run numbers can wobble ±20%.
> Trends and ratios are reliable, individual measurements less so. We didn't pin clocks.

---

*Written 2026-05-11. Renderer: zizi @ `65b9db8`+. Host: Apple M2-class MacBook, Chromium headless.*
