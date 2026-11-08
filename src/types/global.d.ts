import type { ToyStore } from '../state/store';
import type { GlobeController } from '../engine/view';

declare global {
  interface Window {
    /** Test/debug handle (SKILL.md §7): assert on store state, never on pixels. */
    __toy?: {
      store: ToyStore;
      /** Globe controls, present once `globe.status` is 'ready'. */
      engine?: GlobeController;
    };
    /**
     * Resolves once boot has finished: the WebGL fallback is showing, or the globe
     * is ready, or the globe failed to start.
     */
    __toyReady?: Promise<void>;
  }
}

export {};
