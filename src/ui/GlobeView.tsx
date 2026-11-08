import { useEffect, useRef, useState } from 'preact/hooks';
import { store } from '../state/store';
import type { GlobeController } from '../engine/view';
import { useStore } from './useStore';
import { LoadingScreen } from './LoadingScreen';
import { Hud } from './Hud';

const isDebug = (): boolean => new URLSearchParams(window.location.search).get('debug') === '1';

/**
 * Mounts the 3D globe into a full-viewport host. The engine (and three.js) is loaded
 * with a dynamic import so it lands in its own chunk, after the shell has painted.
 */
export function GlobeView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<GlobeController | null>(null);
  const status = useStore((s) => s.globe.status);
  const error = useStore((s) => s.globe.error);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const { setGlobeStatus } = store.getState();
    setGlobeStatus('loading');

    import('../engine/Engine')
      .then(({ createEngine }) => createEngine({ host, store, debug: isDebug() }))
      .then((engine) => {
        if (cancelled) {
          engine.dispose();
          return;
        }
        dispose = () => engine.dispose();
        if (window.__toy) window.__toy.engine = engine.controller;
        setController(engine.controller);
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
      {status === 'ready' && controller && <Hud controller={controller} />}
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
