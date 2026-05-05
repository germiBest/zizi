import { type Hounsfield, HU, type WindowLevel, WL_SOFT } from '@/core/units';
import { type TfPresetName, TransferFn } from '@/render/transfer-fn';

export type SlabReduce = 'min' | 'max' | 'avg';
export type RenderMode = 'dvr' | 'mip' | 'minip' | 'avg';

export const RENDER_MODE_TO_ID: Record<RenderMode, number> = {
  dvr: 0,
  mip: 1,
  minip: 2,
  avg: 3,
};

export class AppState {
  wl: WindowLevel = WL_SOFT;
  tf: TransferFn = TransferFn.preset('soft');
  tfPreset: TfPresetName = 'soft';
  slabSlices = 1;
  slabReduce: SlabReduce = 'avg';
  axial = 0.5;
  sagittal = 0.5;
  coronal = 0.5;
  cameraResetCount = 0;
  autoSpinRps = 0.1;
  renderMode: RenderMode = 'dvr';
  gradientShading = false;

  private v = 0;

  bump(): void {
    this.v += 1;
  }
  get version(): number {
    return this.v;
  }

  setWindowLevel(wl: WindowLevel): void {
    this.wl = wl;
    this.bump();
  }

  setTransferFn(tf: TransferFn, preset: TfPresetName | 'custom' = 'custom'): void {
    this.tf = tf;
    if (preset !== 'custom') this.tfPreset = preset;
    this.bump();
  }

  setSlab(slices: number, reduce: SlabReduce): void {
    this.slabSlices = Math.max(1, Math.floor(slices));
    this.slabReduce = reduce;
    this.bump();
  }

  setSlice(plane: 'axial' | 'sagittal' | 'coronal', n: number): void {
    const v = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
    if (plane === 'axial') this.axial = v;
    else if (plane === 'sagittal') this.sagittal = v;
    else this.coronal = v;
    this.bump();
  }

  requestCameraReset(): void {
    this.cameraResetCount += 1;
    this.bump();
  }
  setAutoSpin(rps: number): void {
    this.autoSpinRps = rps;
    this.bump();
  }
  setRenderMode(m: RenderMode): void {
    this.renderMode = m;
    this.bump();
  }
  setGradientShading(on: boolean): void {
    this.gradientShading = on;
    this.bump();
  }
}

const wl = (c: number, w: number): WindowLevel => ({
  center: HU(c),
  width: HU(w) as Hounsfield,
});

export function presetFor(preset: TfPresetName): { tf: TransferFn; wl: WindowLevel | null } {
  const tf = TransferFn.preset(preset);
  if (preset === 'lung') return { tf, wl: wl(-600, 1500) };
  if (preset === 'soft') return { tf, wl: wl(40, 400) };
  if (preset === 'bone') return { tf, wl: wl(300, 1500) };
  if (preset === 'brain') return { tf, wl: wl(40, 80) };
  return { tf, wl: null };
}
