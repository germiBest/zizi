import { mat4 } from 'wgpu-matrix';
import type { CameraSnapshot } from '@/render/frame';

export interface OrbitInit {
  readonly target?: readonly [number, number, number];
  readonly distance?: number;
  readonly azimuth?: number;
  readonly elevation?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
}

const ELEV_LIMIT = Math.PI / 2 - 0.01;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export class OrbitCamera {
  private azimuth_: number;
  private elevation_: number;
  private distance_: number;
  private readonly target_: Float32Array;
  private readonly defaults: Required<OrbitInit>;
  private readonly minDistance: number;
  private readonly maxDistance: number;

  private dirtyFlag = true;
  private dragging = false;
  private dragButton = 0;
  private lastX = 0;
  private lastY = 0;
  private autoSpinRps = 0;

  private readonly eye = new Float32Array(3);
  private readonly tgtTmp = new Float32Array(3);
  private readonly up = new Float32Array([0, 1, 0]);
  private readonly viewMat = new Float32Array(16);
  private readonly snapshotBuf: CameraSnapshot;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    init: OrbitInit = {},
  ) {
    this.azimuth_ = init.azimuth ?? 0.6;
    this.elevation_ = clamp(init.elevation ?? Math.PI / 6, -ELEV_LIMIT, ELEV_LIMIT);
    this.distance_ = init.distance ?? 3;
    this.target_ = new Float32Array(init.target ?? [0, 0, 0]);
    this.minDistance = init.minDistance ?? 0.5;
    this.maxDistance = init.maxDistance ?? 50;
    this.defaults = {
      target: init.target ?? [0, 0, 0],
      distance: init.distance ?? 3,
      azimuth: init.azimuth ?? 0.6,
      elevation: init.elevation ?? Math.PI / 6,
      minDistance: this.minDistance,
      maxDistance: this.maxDistance,
    };
    this.snapshotBuf = { view: this.viewMat, position: this.eye };

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
  }

  setAutoSpin(rps: number): void {
    this.autoSpinRps = rps;
    if (rps !== 0) this.dirtyFlag = true;
  }

  reset(): void {
    this.azimuth_ = this.defaults.azimuth;
    this.elevation_ = this.defaults.elevation;
    this.distance_ = this.defaults.distance;
    this.target_.set(this.defaults.target);
    this.dirtyFlag = true;
  }

  tick(dt: number): void {
    if (this.autoSpinRps !== 0) {
      this.azimuth_ += this.autoSpinRps * dt * 2 * Math.PI;
      this.dirtyFlag = true;
    }
  }

  get dirty(): boolean {
    return this.dirtyFlag;
  }
  markClean(): void {
    this.dirtyFlag = false;
  }
  get azimuth(): number {
    return this.azimuth_;
  }
  get elevation(): number {
    return this.elevation_;
  }
  get distance(): number {
    return this.distance_;
  }

  position(out?: Float32Array): Float32Array {
    const o = out ?? this.eye;
    const ce = Math.cos(this.elevation_);
    o[0] = this.distance_ * ce * Math.sin(this.azimuth_) + this.target_[0]!;
    o[1] = this.distance_ * Math.sin(this.elevation_) + this.target_[1]!;
    o[2] = this.distance_ * ce * Math.cos(this.azimuth_) + this.target_[2]!;
    return o;
  }

  view(): Float32Array {
    this.position(this.eye);
    this.tgtTmp.set(this.target_);
    mat4.lookAt(this.eye, this.tgtTmp, this.up, this.viewMat);
    return this.viewMat;
  }

  snapshot(): CameraSnapshot {
    this.view();
    return this.snapshotBuf;
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.dragging = true;
    this.dragButton = e.button;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || this.dragButton !== 0) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.azimuth_ -= dx * 0.01;
    this.elevation_ = clamp(this.elevation_ + dy * 0.01, -ELEV_LIMIT, ELEV_LIMIT);
    this.dirtyFlag = true;
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.distance_ = clamp(
      this.distance_ * Math.exp(e.deltaY * 0.001),
      this.minDistance,
      this.maxDistance,
    );
    this.dirtyFlag = true;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
