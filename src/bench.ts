import { buildEnv, buildRecord, downloadBenchRecord, type GpuTimesMap } from '@/bench/recorder';
import { OrbitCamera } from '@/camera/orbit';
import { generatePhantom } from '@/dicom/phantom';
import { GpuContext } from '@/gpu/context';
import { Surface } from '@/gpu/surface';
import { DisplayPass } from '@/render/display';
import { MinMaxGrid } from '@/render/minmax-grid';
import { RaycastPass } from '@/render/raycaster';
import { Renderer } from '@/render/renderer';
import { TransferFnTexture } from '@/render/transfer-fn';
import { uploadVolume } from '@/render/volume-upload';
import { AppState } from '@/state/app-state';

const WARMUP = 30;
const FRAMES = 60;

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const log = document.querySelector<HTMLElement>('#log');
  if (!canvas || !log) throw new Error('bench: missing #stage or #log');

  const append = (line: string) => {
    log.textContent = `${log.textContent ?? ''}${line}\n`;
  };

  append('booting GPU…');
  const ctx = await GpuContext.create();
  append(`adapter: ${ctx.adapterInfo.vendor} ${ctx.adapterInfo.architecture}`);

  const surface = new Surface(ctx, canvas, { maxDpr: 1, autoResize: false });
  const volTex = uploadVolume(ctx, generatePhantom({ size: 64 }));
  const state = new AppState();
  const tfTex = new TransferFnTexture(ctx);
  tfTex.upload(
    state.tf,
    (state.wl.center as number) - (state.wl.width as number) / 2,
    (state.wl.center as number) + (state.wl.width as number) / 2,
  );

  const camera = new OrbitCamera(canvas, { distance: 2.5 });
  const minmax = new MinMaxGrid(ctx, volTex);
  minmax.rebuildFor(volTex);
  const renderer = new Renderer(ctx, surface, [
    new RaycastPass(ctx, volTex, state, tfTex, minmax),
    new DisplayPass(ctx),
  ]);

  append(`warmup: ${WARMUP} frames…`);
  for (let i = 0; i < WARMUP; i++) {
    camera.tick(1 / 60);
    renderer.tick(1 / 60, camera.snapshot());
    await ctx.queue.onSubmittedWorkDone();
  }

  append(`recording: ${FRAMES} frames…`);
  const passNames = renderer.timestamps.passNames();
  const gpuTimes: Record<string, number[]> = Object.fromEntries(passNames.map((n) => [n, []]));
  const frameTimesMs: number[] = [];
  for (let i = 0; i < FRAMES; i++) {
    camera.tick(1 / 60);
    renderer.tick(1 / 60, camera.snapshot());
    await ctx.queue.onSubmittedWorkDone();
    if (Number.isFinite(renderer.lastFrameMs)) frameTimesMs.push(renderer.lastFrameMs);
    for (const name of passNames) {
      const ms = renderer.timestamps.lastMs(name);
      if (Number.isFinite(ms)) gpuTimes[name]!.push(ms);
    }
  }

  const env = buildEnv({
    adapter: ctx.adapterInfo,
    canvas: { width: canvas.width, height: canvas.height, dpr: globalThis.devicePixelRatio ?? 1 },
    transferKind: 'raw',
    pyramidLevels: 1,
    manifestSchema: 'zizi-volume/v1',
  });
  const anyGpu = Object.values(gpuTimes).some((a) => a.length > 0);
  const gpuMap: GpuTimesMap | null = anyGpu ? gpuTimes : null;

  const record = buildRecord({
    scenario: 'smoke',
    warmupFrames: WARMUP,
    frameTimesMs,
    gpuTimesMs: gpuMap,
    env,
    ttfpMs: renderer.ttfpMs,
  });

  append('\n--- BenchRecord (zizi-bench/v2) ---\n');
  append(JSON.stringify(record, null, 2));
  console.info('[zizi/bench] record', record);

  (globalThis as { __zizi_bench__?: unknown }).__zizi_bench__ = {
    record,
    download: () => downloadBenchRecord(record),
  };
}

main().catch((e) => {
  const log = document.querySelector('#log');
  const msg = e instanceof Error ? e.message : String(e);
  if (log) log.textContent = `bench failed: ${msg}`;
  console.error(e);
});
