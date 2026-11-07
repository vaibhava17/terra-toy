/** Boot: loading screen → capability check → fallback or app (PLAN §3.1). */
import { h, render } from 'preact';
import './styles.css';
import { checkWebGL } from './engine/capabilities';
import { store } from './state/store';
import { Root } from './ui/Root';

let resolveReady!: () => void;
window.__toyReady = new Promise<void>((resolve) => {
  resolveReady = resolve;
});
// Exposed in every build: the static site has no secrets, and e2e runs against `vite preview`.
window.__toy = { store };

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root element missing');
  render(h(Root, null), root);
  // Let the loading screen paint before doing any work.
  await nextFrame();

  const gl = checkWebGL();
  const { setWebGL, setBoot } = store.getState();
  setWebGL(gl.reason ? { version: gl.version, reason: gl.reason } : { version: gl.version });
  setBoot(gl.ok ? 'ready' : 'no-webgl');
}

boot()
  .catch((err: unknown) => {
    console.error('[terra-toy] boot failed', err);
    const { setWebGL, setBoot } = store.getState();
    setWebGL({ version: 0, reason: `Startup error: ${String(err)}` });
    setBoot('no-webgl');
  })
  .finally(() => resolveReady());
