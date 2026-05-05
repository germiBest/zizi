import type { Extent3D } from '@/core/types';
import type { AppState } from '@/state/app-state';
import { el } from './dom';

interface Entry {
  readonly slider: HTMLInputElement;
  readonly val: HTMLSpanElement;
  readonly maxV: number;
  readonly read: () => number;
}

export class PlaneControl {
  private readonly entries: Entry[] = [];

  constructor(
    host: HTMLElement,
    private readonly state: AppState,
    level0Extent: Extent3D,
  ) {
    const group = el('div', { className: 'group' }, [el('h4', { textContent: 'Slice' })]);
    host.append(group);

    const add = (
      label: string,
      dim: number,
      read: () => number,
      onChange: (n: number) => void,
    ): void => {
      const max = Math.max(0, dim - 1);
      const init = Math.round(read() * max);
      const val = el('span', { className: 'value', textContent: `${init}/${max}` });
      const slider = el('input', {
        type: 'range',
        min: '0',
        max: String(max),
        step: '1',
        value: String(init),
      });
      slider.addEventListener('input', () => {
        const n = Number.parseInt(slider.value, 10);
        val.textContent = `${n}/${max}`;
        onChange(max === 0 ? 0 : n / max);
      });
      group.append(el('label', undefined, [el('span', { textContent: label }), slider, val]));
      this.entries.push({ slider, val, maxV: dim, read });
    };

    add(
      'axial',
      level0Extent.depth,
      () => state.axial,
      (n) => state.setSlice('axial', n),
    );
    add(
      'sagittal',
      level0Extent.width,
      () => state.sagittal,
      (n) => state.setSlice('sagittal', n),
    );
    add(
      'coronal',
      level0Extent.height,
      () => state.coronal,
      (n) => state.setSlice('coronal', n),
    );
  }

  refresh(): void {
    for (const e of this.entries) {
      const cur = Math.round(e.read() * Math.max(1, e.maxV - 1));
      if (cur !== Number.parseInt(e.slider.value, 10)) {
        e.slider.value = String(cur);
        e.val.textContent = `${cur}/${e.maxV - 1}`;
      }
    }
  }
}
