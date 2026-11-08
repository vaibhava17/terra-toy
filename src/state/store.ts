/**
 * App-wide state shared by the engine and the UI (PLAN §2). Framework-agnostic:
 * this module must not import Preact — the UI hook lives in `src/ui/useStore.ts`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { WebGLVersion } from '../engine/capabilities';
import { DEFAULT_VIEW, sameCountry, type CountryRef, type GlobeViewState } from '../engine/view';

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
  /** Country under the mouse/pen (never set by touch). Written only when it changes. */
  hoveredCountry: CountryRef | null;
  /** Country the player tapped; tapping the sea or the chip's × clears it. */
  selectedCountry: CountryRef | null;
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
  /** No-op (no notification) when the country is unchanged. */
  setHoveredCountry: (country: CountryRef | null) => void;
  /** No-op (no notification) when the country is unchanged. */
  setSelectedCountry: (country: CountryRef | null) => void;
}

export type ToyStore = StoreApi<ToyState>;

const copyCountry = (c: CountryRef | null): CountryRef | null =>
  c ? { id: c.id, name: c.name } : null;

/** Creates a fresh store (used by tests; the app uses the `store` singleton). */
export function createToyStore(): ToyStore {
  return createStore<ToyState>()((set) => ({
    boot: 'loading',
    webgl: { version: 0 },
    globe: {
      status: 'idle',
      view: { ...DEFAULT_VIEW },
      hoveredCountry: null,
      selectedCountry: null,
    },
    setBoot: (boot) => set({ boot }),
    setWebGL: (webgl) => set({ webgl: { ...webgl } }),
    setGlobeStatus: (status, error) =>
      set((s) => {
        const { view, hoveredCountry, selectedCountry } = s.globe;
        const globe: GlobeSlice = { status, view, hoveredCountry, selectedCountry };
        if (status === 'error' && error !== undefined) globe.error = error;
        return { globe };
      }),
    setGlobeView: ({ lat, lng, distance }) =>
      set((s) => ({ globe: { ...s.globe, view: { lat, lng, distance } } })),
    // Returning the unchanged state makes zustand skip the notification.
    setHoveredCountry: (country) =>
      set((s) =>
        sameCountry(s.globe.hoveredCountry, country)
          ? s
          : { globe: { ...s.globe, hoveredCountry: copyCountry(country) } },
      ),
    setSelectedCountry: (country) =>
      set((s) =>
        sameCountry(s.globe.selectedCountry, country)
          ? s
          : { globe: { ...s.globe, selectedCountry: copyCountry(country) } },
      ),
  }));
}

export const store: ToyStore = createToyStore();
