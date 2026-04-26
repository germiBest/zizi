import { OrbitCamera } from '@/camera/orbit';
import { generatePhantom } from '@/dicom/phantom';
import { GpuContext } from '@/gpu/context';
import { Swapchain } from '@/gpu/swapchain';
import { DisplayPass } from '@/render/display';
import { RaycastPass } from '@/render/raycaster';
import { Renderer } from '@/render/renderer';
import { uploadVolume } from '@/render/volume-upload';
import { PerfOverlay } from '@/ui/perf-overlay';

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const hud = document.querySelector<HTMLElement>('#hud');
  const diag = document.querySelector<HTMLElement>('#diag');
  if (!canvas || !hud || !diag) {
    throw new Error('main: missing required DOM elements');
  }

  const swapchain = new Swapchain(canvas, { maxDpr: 1.5 });
  swapchain.start();

  let ctx: GpuContext;
  try {
    ctx = await GpuContext.create({ canvas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    diag.textContent = `WebGPU init failed: ${msg}`;
    diag.classList.add('err');
    throw e;
  }

  ctx.events.on('device-lost', ({ reason, message }) => {
    diag.textContent = `Device lost (${reason}): ${message}`;
    diag.classList.add('err');
  });

  const volume = generatePhantom({ size: 64 });
  const volTex = uploadVolume(ctx, volume);

  const camera = new OrbitCamera(canvas, { distance: 2.5 });
  camera.setAutoSpin(0.1);

  const renderer = new Renderer(ctx, swapchain, [
    new RaycastPass(ctx, volTex, camera),
    new DisplayPass(ctx),
  ]);

  const overlay = new PerfOverlay(hud, ctx.registry);

  diag.textContent = `${ctx.adapterInfo.vendor || 'unknown'} · ${ctx.adapterInfo.architecture || 'unknown'}`;

  if (__DEV__) {
    (globalThis as { __zizi?: unknown }).__zizi = { ctx, renderer, camera, volTex };
  }

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = (now - last) / 1000;
    last = now;
    camera.tick(dt);
    renderer.tick(dt);
    overlay.sample(renderer.lastFrameMs, renderer.lastGpuMs);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error('[zizi/main] fatal:', e);
});
