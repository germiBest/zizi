import { HU } from '@/core/units';
import type { AppState } from '@/state/app-state';

export class WindowLevelControls {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: AppState,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 2) return;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    const wl = this.state.wl;
    const widthScale = Math.max(wl.width as number, 100) / 200;
    const newWidth = Math.max(1, (wl.width as number) + dx * widthScale);
    const newLevel = (wl.center as number) + dy * widthScale;
    this.state.setWindowLevel({ center: HU(newLevel), width: HU(newWidth) });
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
