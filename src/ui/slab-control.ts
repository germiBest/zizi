import type { AppState, SlabReduce } from '@/state/app-state';
import { el } from './dom';

const REDUCERS: readonly SlabReduce[] = ['min', 'max', 'avg'];

export class SlabControl {
  private readonly slider: HTMLInputElement;
  private readonly val: HTMLSpanElement;
  private readonly radios: HTMLInputElement[] = [];
  private lastSlices: number;
  private lastReduce: SlabReduce;

  constructor(
    host: HTMLElement,
    private readonly state: AppState,
  ) {
    this.lastSlices = state.slabSlices;
    this.lastReduce = state.slabReduce;
    const group = makeGroup(host, 'Slab');

    this.val = el('span', { className: 'value', textContent: String(state.slabSlices) });
    this.slider = el('input', {
      type: 'range',
      min: '1',
      max: '64',
      step: '1',
      value: String(state.slabSlices),
    });
    this.slider.addEventListener('input', () => {
      const n = Number.parseInt(this.slider.value, 10);
      this.val.textContent = String(n);
      state.setSlab(n, state.slabReduce);
      this.lastSlices = n;
    });
    group.append(
      el('label', undefined, [el('span', { textContent: 'thickness' }), this.slider, this.val]),
    );

    const radios = el('span', { className: 'reduce' });
    for (const mode of REDUCERS) {
      const id = `slab-${mode}`;
      const r = el('input', { type: 'radio', name: 'slab-reduce', id, value: mode });
      r.checked = state.slabReduce === mode;
      r.addEventListener('change', () => {
        if (r.checked) {
          state.setSlab(state.slabSlices, mode);
          this.lastReduce = mode;
        }
      });
      this.radios.push(r);
      radios.append(r, el('label', { htmlFor: id, textContent: mode }));
    }
    group.append(el('label', undefined, [el('span', { textContent: 'reduce' }), radios]));
  }

  refresh(): void {
    if (this.state.slabSlices !== this.lastSlices) {
      this.slider.value = String(this.state.slabSlices);
      this.val.textContent = String(this.state.slabSlices);
      this.lastSlices = this.state.slabSlices;
    }
    if (this.state.slabReduce !== this.lastReduce) {
      for (const r of this.radios) r.checked = r.value === this.state.slabReduce;
      this.lastReduce = this.state.slabReduce;
    }
  }
}

function makeGroup(host: HTMLElement, title: string): HTMLDivElement {
  const div = el('div', { className: 'group' }, [el('h4', { textContent: title })]);
  host.append(div);
  return div;
}
