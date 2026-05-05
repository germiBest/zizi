import type { AppState, RenderMode } from '@/state/app-state';
import { el } from './dom';

export interface DatasetOption {
  readonly id: string;
  readonly label: string;
  readonly url: string | null;
  readonly pyramidLevels?: number;
}

const DATASETS: readonly DatasetOption[] = [
  { id: 'phantom-64', label: 'Phantom 64³ (synthetic)', url: null },
  { id: 'phantom-128', label: 'Phantom 128³', url: '/datasets/phantom-128/manifest.json' },
  { id: 'ct-small', label: 'CT_small.dcm (1 slice)', url: '/datasets/ct-small/manifest.json' },
  { id: 'ct-thin', label: 'CT thin · raw 98 MB', url: '/datasets/ct-thin/manifest.json' },
  {
    id: 'ct-thin-htj2k',
    label: 'CT thin · HTJ2K 46 MB',
    url: '/datasets/ct-thin-htj2k/manifest.json',
  },
  {
    id: 'ct-thin-pyramid',
    label: 'CT thin · pyramid+HTJ2K 54 MB',
    url: '/datasets/ct-thin-pyramid/manifest.json',
    pyramidLevels: 4,
  },
  {
    id: 'ct-contrast',
    label: 'CT contrast · raw 263 MB',
    url: '/datasets/ct-contrast/manifest.json',
  },
];

const MODES: { mode: RenderMode; label: string; title: string }[] = [
  { mode: 'dvr', label: 'DVR', title: 'Direct volume rendering (front-to-back compositing)' },
  { mode: 'mip', label: 'MIP', title: 'Maximum intensity projection — best for vessels (CTA)' },
  { mode: 'minip', label: 'MinIP', title: 'Minimum intensity projection — best for airways/lungs' },
  { mode: 'avg', label: 'Avg', title: 'Average intensity — X-ray-like look' },
];

export interface TopBarInit {
  readonly volumeUrl: string | null;
  readonly capLevel: number;
  readonly sourceLabel: string;
  readonly adapterLabel: string;
}

export class TopBar {
  private readonly datasetSelect = el('select', { className: 'tb-select' });
  private readonly levelSelect = el('select', { className: 'tb-select' });
  private readonly levelGroup = makeGroup('level');
  private readonly spinToggle = el('input', { type: 'checkbox' });
  private readonly gradToggle = el('input', { type: 'checkbox' });
  private readonly gradLabel: HTMLLabelElement;
  private readonly modeButtons = new Map<RenderMode, HTMLButtonElement>();
  private readonly statusEl: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly state: AppState,
    init: TopBarInit,
  ) {
    host.classList.add('topbar');
    const matched = matchDataset(init.volumeUrl);

    host.append(el('div', { className: 'tb-brand', textContent: 'zizi' }));

    // dataset
    for (const opt of DATASETS) {
      this.datasetSelect.append(
        el('option', { value: opt.id, textContent: opt.label, selected: opt.id === matched.id }),
      );
    }
    this.datasetSelect.addEventListener('change', () => this.applyNavigation());
    const dsGroup = makeGroup('source');
    dsGroup.append(this.datasetSelect);
    host.append(dsGroup);

    // level cap
    this.levelSelect.addEventListener('change', () => this.applyNavigation());
    this.levelGroup.append(this.levelSelect);
    host.append(this.levelGroup);
    this.populateLevels(matched, init.capLevel);

    // mode segmented
    host.append(makeSep());
    const modeBar = el('div', { className: 'tb-segment' });
    for (const def of MODES) {
      const btn = el('button', {
        type: 'button',
        className: 'tb-seg-btn',
        textContent: def.label,
        title: def.title,
      });
      btn.classList.toggle('active', state.renderMode === def.mode);
      btn.addEventListener('click', () => {
        state.setRenderMode(def.mode);
        this.refreshModeButtons();
        this.refreshGradVisibility();
      });
      this.modeButtons.set(def.mode, btn);
      modeBar.append(btn);
    }
    const modeWrap = makeGroup('mode');
    modeWrap.append(modeBar);
    host.append(modeWrap);

    // gradient shading
    this.gradToggle.checked = state.gradientShading;
    this.gradToggle.addEventListener('change', () =>
      state.setGradientShading(this.gradToggle.checked),
    );
    this.gradLabel = el('label', { className: 'tb-toggle' }, [
      this.gradToggle,
      el('span', { textContent: 'shaded', title: 'Lambert + Blinn-Phong from gradient (DVR)' }),
    ]);
    host.append(this.gradLabel);
    this.refreshGradVisibility();

    // actions
    host.append(makeSep());
    const reset = el('button', {
      type: 'button',
      className: 'tb-btn',
      textContent: '↻ reset',
      title: 'Reset orbit camera (R)',
    });
    reset.addEventListener('click', () => state.requestCameraReset());
    host.append(reset);

    this.spinToggle.checked = state.autoSpinRps !== 0;
    this.spinToggle.addEventListener('change', () =>
      state.setAutoSpin(this.spinToggle.checked ? 0.1 : 0),
    );
    host.append(
      el('label', { className: 'tb-toggle' }, [
        this.spinToggle,
        el('span', { textContent: 'spin' }),
      ]),
    );

    // spacer + status + hud slot
    host.append(el('div', { className: 'tb-spacer' }));
    this.statusEl = el('div', {
      className: 'tb-status',
      textContent: `${init.adapterLabel} · ${init.sourceLabel}`,
    });
    host.append(this.statusEl);
    host.append(el('div', { id: 'hud', className: 'hud tb-hud' }));
  }

  refresh(): void {
    const wantSpin = this.state.autoSpinRps !== 0;
    if (this.spinToggle.checked !== wantSpin) this.spinToggle.checked = wantSpin;
    if (this.gradToggle.checked !== this.state.gradientShading)
      this.gradToggle.checked = this.state.gradientShading;
    this.refreshModeButtons();
    this.refreshGradVisibility();
  }

  setStatus(label: string): void {
    this.statusEl.textContent = label;
  }

  private refreshModeButtons(): void {
    for (const [mode, btn] of this.modeButtons)
      btn.classList.toggle('active', this.state.renderMode === mode);
  }

  private refreshGradVisibility(): void {
    const enabled = this.state.renderMode === 'dvr';
    this.gradLabel.classList.toggle('disabled', !enabled);
    this.gradToggle.disabled = !enabled;
  }

  private populateLevels(matched: DatasetOption, capLevel: number): void {
    this.levelSelect.replaceChildren();
    if (matched.pyramidLevels === undefined) {
      this.levelGroup.style.display = 'none';
      return;
    }
    this.levelGroup.style.display = '';
    this.levelSelect.append(el('option', { value: 'auto', textContent: 'auto' }));
    for (let i = 0; i < matched.pyramidLevels; i++) {
      const tail = i === 0 ? ' (full)' : i === matched.pyramidLevels - 1 ? ' (coarsest)' : '';
      this.levelSelect.append(el('option', { value: String(i), textContent: `L${i}${tail}` }));
    }
    this.levelSelect.value = capLevel >= 0 ? String(capLevel) : 'auto';
  }

  private applyNavigation(): void {
    const id = this.datasetSelect.value;
    const opt = DATASETS.find((d) => d.id === id) ?? DATASETS[0]!;
    const params = new URLSearchParams();
    if (opt.url) params.set('volume', opt.url);
    if (opt.pyramidLevels !== undefined && this.levelSelect.value !== 'auto')
      params.set('capLevel', this.levelSelect.value);
    const qs = params.toString();
    window.location.search = qs ? `?${qs}` : '';
  }
}

function matchDataset(url: string | null): DatasetOption {
  if (!url) return DATASETS[0]!;
  return DATASETS.find((d) => d.url === url) ?? { id: 'custom', label: `(custom) ${url}`, url };
}

function makeSep(): HTMLElement {
  return el('div', { className: 'tb-sep' });
}

function makeGroup(label: string): HTMLLabelElement {
  return el('label', { className: 'tb-group' }, [
    el('span', { className: 'tb-group-label', textContent: label }),
  ]);
}
