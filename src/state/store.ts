/**
 * App-wide state shared by the engine and the UI (PLAN §2). Framework-agnostic:
 * this module must not import Preact — the UI hook lives in `src/ui/useStore.ts`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WebGLVersion } from '../engine/capabilities';
import { DEFAULT_VIEW, type GlobeViewState } from '../engine/view';

export type BootPhase = 'loading' | 'ready' | 'no-webgl';

export interface WebGLInfo {
  version: WebGLVersion;
  reason?: string;
}

export type GlobeStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface GlobeSlice {
  status: GlobeStatus;
  /** Technical detail when status is 'error'. */
  error?: string;
  /**
   * Last settled camera view. Written by the engine only when the camera comes to
   * rest (after user input, inertia or a flight), never every frame.
   */
  view: GlobeViewState;
}

export interface ToyState {
  boot: BootPhase;
  webgl: WebGLInfo;
  globe: GlobeSlice;
  setBoot: (boot: BootPhase) => void;
  setWebGL: (webgl: WebGLInfo) => void;
  /** Sets the globe status; `error` is kept only for the 'error' status. */
  setGlobeStatus: (status: GlobeStatus, error?: string) => void;
  setGlobeView: (view: GlobeViewState) => void;
}

export type ToyStore = StoreApi<ToyState>;

/** Creates a fresh store (used by tests; the app uses the `store` singleton). */
export function createToyStore(): ToyStore {
  return createStore<ToyState>()((set) => ({
    boot: 'loading',
    webgl: { version: 0 },
    globe: { status: 'idle', view: { ...DEFAULT_VIEW } },
    setBoot: (boot) => set({ boot }),
    setWebGL: (webgl) => set({ webgl: { ...webgl } }),
    setGlobeStatus: (status, error) =>
      set((s) => {
        const globe: GlobeSlice = { status, view: s.globe.view };
        if (status === 'error' && error !== undefined) globe.error = error;
        return { globe };
      }),
    setGlobeView: ({ lat, lng, distance }) =>
      set((s) => ({ globe: { ...s.globe, view: { lat, lng, distance } } })),
  }));
}

export const store: ToyStore = createToyStore();
