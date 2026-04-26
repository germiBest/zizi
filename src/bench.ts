import { buildEnv, buildRecord, downloadBenchRecord } from '@/bench/recorder';
import { OrbitCamera } from '@/camera/orbit';
import { generatePhantom } from '@/dicom/phantom';
import { GpuContext } from '@/gpu/context';
import { Swapchain } from '@/gpu/swapchain';
import { DisplayPass } from '@/render/display';
import { RaycastPass } from '@/render/raycaster';
import { Renderer } from '@/render/renderer';
import { uploadVolume } from '@/render/volume-upload';

const WARMUP = 30;
const FRAMES = 60;

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const log = document.querySelector<HTMLElement>('#log');
  if (!canvas || !log) throw new Error('bench: missing #stage or #log');

  appendLog(log, 'booting GPU…');

  const swapchain = new Swapchain(canvas, { maxDpr: 1 });
  const ctx = await GpuContext.create({ canvas });

  appendLog(log, `adapter: ${ctx.adapterInfo.vendor} ${ctx.adapterInfo.architecture}`);

  const volume = generatePhantom({ size: 64 });
  const volTex = uploadVolume(ctx, volume);

  const camera = new OrbitCamera(canvas, { distance: 2.5 });
  const renderer = new Renderer(ctx, swapchain, [
    new RaycastPass(ctx, volTex, camera),
    new DisplayPass(ctx),
  ]);

  appendLog(log, `warmup: ${WARMUP} frames…`);
  for (let i = 0; i < WARMUP; i++) {
    renderer.tick(1 / 60);
    await ctx.queue.onSubmittedWorkDone();
  }

  appendLog(log, `recording: ${FRAMES} frames…`);
  const frameTimesMs: number[] = [];
  for (let i = 0; i < FRAMES; i++) {
    camera.tick(1 / 60);
    renderer.tick(1 / 60);
    await ctx.queue.onSubmittedWorkDone();
    if (Number.isFinite(renderer.lastFrameMs)) {
      frameTimesMs.push(renderer.lastFrameMs);
    }
  }

  const env = buildEnv({
    adapter: ctx.adapterInfo,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      dpr: globalThis.devicePixelRatio ?? 1,
    },
  });

  const record = buildRecord({
    scenario: 'smoke',
    warmupFrames: WARMUP,
    frameTimesMs,
    gpuTimesMs: null,
    env,
  });

  appendLog(log, '\n--- BenchRecord (zizi-bench/v1) ---\n');
  appendLog(log, JSON.stringify(record, null, 2));
  console.info('[zizi/bench] record', record);

  (globalThis as { __zizi_bench__?: unknown }).__zizi_bench__ = {
    record,
    download: () => downloadBenchRecord(record),
  };
}

function appendLog(el: HTMLElement, line: string): void {
  el.textContent = `${el.textContent ?? ''}${line}\n`;
}

main().catch((e) => {
  const log = document.querySelector('#log');
  const msg = e instanceof Error ? e.message : String(e);
  if (log) log.textContent = `bench failed: ${msg}`;
  console.error(e);
});
