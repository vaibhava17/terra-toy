import type { ToyStore } from '../state/store';

declare global {
  interface Window {
    /** Test/debug handle (SKILL.md §7): assert on store state, never on pixels. */
    __toy?: { store: ToyStore };
    /** Resolves once the boot sequence has finished (ready or fallback). */
    __toyReady?: Promise<void>;
  }
}

export {};
