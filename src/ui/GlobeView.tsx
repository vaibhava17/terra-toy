import { useEffect, useRef, useState } from 'preact/hooks';
import { store } from '../state/store';
import type { LandmarkData } from '../content/schema';
import type { GlobeController } from '../engine/view';
import { useStore } from './useStore';
import { LoadingScreen } from './LoadingScreen';
import { Hud } from './Hud';

const isDebug = (): boolean => new URLSearchParams(window.location.search).get('debug') === '1';

/** `?focus=<landmark id>` (SKILL.md §1): open that landmark once the globe is up. */
const focusParam = (): string | null => new URLSearchParams(window.location.search).get('focus');

/**
 * Mounts the 3D globe into a full-viewport host. The engine (and three.js) and the
 * validated content are loaded with dynamic imports so they land in their own chunks,
 * after the shell has painted.
 */
export function GlobeView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<GlobeController | null>(null);
  const [landmarks, setLandmarks] = useState<readonly LandmarkData[]>([]);
  const status = useStore((s) => s.globe.status);
  const error = useStore((s) => s.globe.error);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const { setGlobeStatus } = store.getState();
    setGlobeStatus('loading');

    Promise.all([import('../engine/Engine'), import('../content/landmarks')])
      .then(([{ createEngine }, content]) =>
        createEngine({ host, store, debug: isDebug() }).then((engine) => ({ engine, content })),
      )
      .then(({ engine, content }) => {
        if (cancelled) {
          engine.dispose();
          return;
        }
        dispose = () => engine.dispose();
        if (window.__toy) window.__toy.engine = engine.controller;
        setController(engine.controller);
        setLandmarks(content.LANDMARKS);
        // Unknown ids are ignored. The engine flies there when the selection changes.
        const focus = content.findLandmark(focusParam());
        if (focus) store.getState().setSelectedLandmark(focus.id);
        setGlobeStatus('ready');
      })
      .catch((err: unknown) => {
        console.error('[terra-toy] globe failed to start', err);
        if (!cancelled) setGlobeStatus('error', err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      dispose?.();
      if (window.__toy) delete window.__toy.engine;
      setController(null);
    };
  }, []);

  return (
    <>
      <div ref={hostRef} class="globe-host" />
      {status === 'ready' && controller && <Hud controller={controller} landmarks={landmarks} />}
      {(status === 'idle' || status === 'loading') && (
        <div class="globe-overlay">
          <LoadingScreen />
        </div>
      )}
      {status === 'error' && (
        <div class="globe-overlay">
          <div class="screen" role="alert">
            <div class="globe-emoji" aria-hidden="true">
              🌍
            </div>
            <h2>Oops! The globe got dizzy.</h2>
            <p class="screen-text">Let's try that again.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
            {error && (
              <details class="tech-details">
                <summary>Details for grown-ups</summary>
                <p class="reason">{error}</p>
              </details>
            )}
          </div>
        </div>
      )}
    </>
  );
}
