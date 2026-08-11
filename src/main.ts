import { OrbitCamera } from '@/camera/orbit';
import { type LoaderProgress, type LoaderStage, loadVolume } from '@/dicom/loader';
import { generatePhantom } from '@/dicom/phantom';
import { isV2Manifest } from '@/dicom/types';
import { GpuContext } from '@/gpu/context';
import { Surface } from '@/gpu/surface';
import { DisplayPass } from '@/render/display';
import { MinMaxGrid } from '@/render/minmax-grid';
import { MprPass } from '@/render/mpr';
import { RaycastPass } from '@/render/raycaster';
import { Renderer } from '@/render/renderer';
import { TransferFnTexture } from '@/render/transfer-fn';
import { uploadVolume } from '@/render/volume-upload';
import { AppState } from '@/state/app-state';
import { WindowLevelControls } from '@/ui/controls';
import { installKeyboard } from '@/ui/keyboard';
import { PalettePicker } from '@/ui/palette-picker';
import { PerfOverlay } from '@/ui/perf-overlay';
import { PlaneControl } from '@/ui/plane-control';
import { SlabControl } from '@/ui/slab-control';
import { TransferFnEditor } from '@/ui/tf-editor';
import { TopBar } from '@/ui/top-bar';

async function main(): Promise<void> {
  const topbarHost = document.querySelector<HTMLElement>('#topbar');
  const threeDCanvas = document.querySelector<HTMLCanvasElement>('#canvas-3d');
  if (!topbarHost || !threeDCanvas) throw new Error('main: missing required DOM elements');

  let ctx: GpuContext;
  try {
    ctx = await GpuContext.create();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    topbarHost.textContent = `WebGPU init failed: ${msg}`;
    topbarHost.classList.add('err');
    throw e;
  }

  const params = new URLSearchParams(window.location.search);
  const volumeUrl = params.get('volume');
  const phantomSize = parseIntOr(params.get('phantom'), 64, 8, 1024);
  const capLevel = parseIntOr(params.get('capLevel'), -1, 0, 32);

  const adapter = `${ctx.adapterInfo.vendor || 'unknown'} · ${ctx.adapterInfo.architecture || 'unknown'}`;
  const state = new AppState();
  const top = new TopBar(topbarHost, state, {
    volumeUrl,
    capLevel,
    sourceLabel: 'loading…',
    adapterLabel: adapter,
  });

  ctx.events.on('device-lost', ({ reason, message }) =>
    top.setStatus(`Device lost (${reason}): ${message}`),
  );

  const loaded = await loadOrPhantom(volumeUrl, phantomSize, capLevel, ctx, top);
  const { bundle, level0Extent, sourceLabel, finished, manifest } = loaded;
  top.setStatus(`${adapter} · ${sourceLabel}`);

  const tfTex = new TransferFnTexture(ctx);
  uploadTfForState(tfTex, state);

  const minmax = new MinMaxGrid(ctx, bundle);
  minmax.rebuildFor(bundle);
  let seenBundleView = bundle.view;

  const camera = new OrbitCamera(threeDCanvas, { distance: 2.5 });
  camera.setAutoSpin(state.autoSpinRps);

  new WindowLevelControls(threeDCanvas, state);
  installKeyboard(state);

  const surfaces = {
    threeD: makeSurface(ctx, 'canvas-3d', 1.5),
    axial: makeSurface(ctx, 'canvas-axial', 1),
    sagittal: makeSurface(ctx, 'canvas-sagittal', 1),
    coronal: makeSurface(ctx, 'canvas-coronal', 1),
  } as const;

  const renderers: Renderer[] = [
    new Renderer(ctx, surfaces.threeD, [
      new RaycastPass(ctx, bundle, state, tfTex, minmax),
      new DisplayPass(ctx),
    ]),
    new Renderer(ctx, surfaces.axial, [
      new MprPass(ctx, bundle, 'axial', state, tfTex),
      new DisplayPass(ctx),
    ]),
    new Renderer(ctx, surfaces.sagittal, [
      new MprPass(ctx, bundle, 'sagittal', state, tfTex),
      new DisplayPass(ctx),
    ]),
    new Renderer(ctx, surfaces.coronal, [
      new MprPass(ctx, bundle, 'coronal', state, tfTex),
      new DisplayPass(ctx),
    ]),
  ];

  const hud = document.querySelector<HTMLElement>('#hud');
  const overlay = hud ? new PerfOverlay(hud, ctx.registry) : null;

  const controlsHost = document.querySelector<HTMLElement>('#controls');
  let tfEditor: TransferFnEditor | null = null;
  let slabControl: SlabControl | null = null;
  let planeControl: PlaneControl | null = null;
  let palette: PalettePicker | null = null;
  if (controlsHost) {
    palette = new PalettePicker(controlsHost, state);
    const tfCol = makeControlColumn(controlsHost, 'Transfer Function');
    tfEditor = new TransferFnEditor(tfCol, state);
    slabControl = new SlabControl(controlsHost, state);
    planeControl = new PlaneControl(controlsHost, state, level0Extent);
  }

  finished.then(() => {
    if (manifest && isV2Manifest(manifest)) top.setStatus(`${adapter} · ${sourceLabel} · full-res`);
  });

  if (__DEV__)
    (globalThis as { __zizi?: unknown }).__zizi = {
      ctx,
      surfaces,
      renderers,
      camera,
      state,
      tfTex,
      bundle,
      manifest,
    };

  let seenWl = state.wl;
  let seenTf = state.tf;
  let seenReset = state.cameraResetCount;
  let seenSpin = state.autoSpinRps;

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;

    if (bundle.view !== seenBundleView) {
      minmax.rebuildFor(bundle);
      seenBundleView = bundle.view;
    }
    if (state.cameraResetCount !== seenReset) camera.reset(), (seenReset = state.cameraResetCount);
    if (state.autoSpinRps !== seenSpin)
      camera.setAutoSpin(state.autoSpinRps), (seenSpin = state.autoSpinRps);
    if (state.wl !== seenWl || state.tf !== seenTf) {
      uploadTfForState(tfTex, state);
      tfEditor?.refresh();
      palette?.refresh();
      seenWl = state.wl;
      seenTf = state.tf;
    }
    slabControl?.refresh();
    planeControl?.refresh();
    top.refresh();

    camera.tick(dt);
    const snap = camera.snapshot();

    let totalCpu = 0,
      totalGpu = 0,
      anyGpu = false;
    for (const r of renderers) {
      r.tick(dt, snap);
      if (Number.isFinite(r.lastFrameMs)) totalCpu += r.lastFrameMs;
      if (Number.isFinite(r.lastGpuMs)) (totalGpu += r.lastGpuMs), (anyGpu = true);
    }
    overlay?.sample(totalCpu, anyGpu ? totalGpu : Number.NaN);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function loadOrPhantom(
  volumeUrl: string | null,
  phantomSize: number,
  capLevel: number,
  ctx: GpuContext,
  top: TopBar,
) {
  if (volumeUrl) {
    try {
      const r = await loadVolume(
        volumeUrl,
        ctx,
        (p) => top.setStatus(formatLoaderStatus(p)),
        capLevel >= 0 ? capLevel : undefined,
      );
      return {
        bundle: r.bundle,
        level0Extent: isV2Manifest(r.manifest) ? r.manifest.levels[0]!.extent : r.manifest.extent,
        sourceLabel: volumeUrl,
        finished: r.finished,
        manifest: r.manifest,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[zizi/main] volume load failed, falling back to phantom:', msg);
      top.setStatus(`load failed: ${msg.slice(0, 80)} — falling back to phantom`);
    }
  }
  const v = generatePhantom({ size: phantomSize });
  return {
    bundle: uploadVolume(ctx, v),
    level0Extent: v.extent,
    sourceLabel: volumeUrl ? `phantom-${phantomSize}³ (fallback)` : `phantom-${phantomSize}³`,
    finished: Promise.resolve(),
    manifest: null,
  };
}

function makeSurface(ctx: GpuContext, id: string, maxDpr: number): Surface {
  const c = document.querySelector<HTMLCanvasElement>(`#${id}`);
  if (!c) throw new Error(`canvas #${id} not found`);
  return new Surface(ctx, c, { maxDpr });
}

function makeControlColumn(host: HTMLElement, title?: string): HTMLElement {
  const col = document.createElement('div');
  col.className = 'group';
  if (title) {
    const h = document.createElement('h4');
    h.textContent = title;
    col.appendChild(h);
  }
  host.appendChild(col);
  return col;
}

function uploadTfForState(tfTex: TransferFnTexture, s: AppState): void {
  const lo = (s.wl.center as number) - (s.wl.width as number) / 2;
  const hi = (s.wl.center as number) + (s.wl.width as number) / 2;
  tfTex.upload(s.tf, lo, hi);
}

function parseIntOr(v: string | null, fallback: number, min: number, max: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

function formatLoaderStatus(p: LoaderProgress): string {
  const lvl = p.level !== undefined ? ` L${p.level}` : '';
  const ss = p.totalSlices !== undefined ? ` ${p.sliceIdx ?? 0}/${p.totalSlices}` : '';
  return `${stageText(p.stage)}${lvl}${ss} ${Math.round(p.pct)}%`;
}

function stageText(s: LoaderStage): string {
  const m: Record<LoaderStage, string> = {
    manifest: 'manifest',
    raw: 'fetching',
    verify: 'verifying',
    decode: 'decoding',
    'level-ready': 'level ready',
    done: 'done',
  };
  return m[s];
}

main().catch((e) => console.error('[zizi/main] fatal:', e));
