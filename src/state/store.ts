/**
 * App-wide state shared by the engine and the UI (PLAN §2). Framework-agnostic:
 * this module must not import Preact — the UI hook lives in `src/ui/useStore.ts`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WebGLVersion } from '../engine/capabilities';

export type BootPhase = 'loading' | 'ready' | 'no-webgl';

export interface WebGLInfo {
  version: WebGLVersion;
  reason?: string;
}

export interface ToyState {
  boot: BootPhase;
  webgl: WebGLInfo;
  setBoot: (boot: BootPhase) => void;
  setWebGL: (webgl: WebGLInfo) => void;
}

export type ToyStore = StoreApi<ToyState>;

/** Creates a fresh store (used by tests; the app uses the `store` singleton). */
export function createToyStore(): ToyStore {
  return createStore<ToyState>()((set) => ({
    boot: 'loading',
    webgl: { version: 0 },
    setBoot: (boot) => set({ boot }),
    setWebGL: (webgl) => set({ webgl: { ...webgl } }),
  }));
}

export const store: ToyStore = createToyStore();
