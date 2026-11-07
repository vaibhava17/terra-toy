import { useStore } from './useStore';
import { App } from './App';
import { LoadingScreen } from './LoadingScreen';
import { WebGLFallback } from './WebGLFallback';

/** Switches between loader, fallback and app based on the boot phase. */
export function Root() {
  const boot = useStore((s) => s.boot);
  const webgl = useStore((s) => s.webgl);
  if (boot === 'loading') return <LoadingScreen />;
  if (boot === 'no-webgl') return <WebGLFallback webgl={webgl} />;
  return <App />;
}
