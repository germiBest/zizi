import type { TfPresetName } from '@/render/transfer-fn';
import { type AppState, presetFor } from '@/state/app-state';

export type KeyboardTarget = HTMLElement | (Window & typeof globalThis);

export function installKeyboard(state: AppState, target: KeyboardTarget = window): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const tgt = e.target as Element | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;

    switch (e.key) {
      case '1':
        applyPreset(state, 'lung');
        break;
      case '2':
        applyPreset(state, 'soft');
        break;
      case '3':
        applyPreset(state, 'bone');
        break;
      case '4':
        applyPreset(state, 'brain');
        break;
      case 'r':
      case 'R':
        state.requestCameraReset();
        break;
      case ' ':
        state.setAutoSpin(state.autoSpinRps === 0 ? 0.1 : 0);
        e.preventDefault();
        break;
    }
  };
  target.addEventListener('keydown', onKey as EventListener);
  return () => {
    target.removeEventListener('keydown', onKey as EventListener);
  };
}

function applyPreset(state: AppState, name: TfPresetName): void {
  const { tf, wl } = presetFor(name);
  if (wl !== null) state.setWindowLevel(wl);
  state.setTransferFn(tf, name);
}
