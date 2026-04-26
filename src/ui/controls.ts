import type { WindowLevel } from '@/core/units';

// TODO(week 3-4): mouse-drag → adjust window/level. Right-drag for level, left-drag
// horizontally for width, etc. Marks renderer dirty on change.
export class WindowLevelControls {
  constructor(
    _canvas: HTMLCanvasElement,
    public wl: WindowLevel,
  ) {}
}
