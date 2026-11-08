import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { GlobeController } from '../engine/view';

const fullscreenSupported = (): boolean =>
  typeof document !== 'undefined' && document.fullscreenEnabled === true;

function toggleFullscreen(): void {
  const req = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  req.catch((err: unknown) => console.warn('[terra-toy] fullscreen request failed', err));
}

/** Four corner brackets; pointing out to enter full screen, in to leave it. */
function FullscreenIcon({ exit }: { exit: boolean }) {
  const d = exit
    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5';
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

interface HudButtonProps {
  label: string;
  onClick: () => void;
  children: ComponentChildren;
}

function HudButton({ label, onClick, children }: HudButtonProps) {
  return (
    <button type="button" class="hud-button" aria-label={label} title={label} onClick={onClick}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

/** Round on-screen controls (bottom-right) plus the title badge. */
export function Hud({ controller }: { controller: GlobeController }) {
  const [canFullscreen] = useState(fullscreenSupported);
  const [isFullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    if (!canFullscreen) return;
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [canFullscreen]);

  return (
    <>
      <div class="title-badge">
        <span aria-hidden="true">🌍</span> Terra Toy
      </div>
      <nav class="hud" aria-label="Globe controls">
        <HudButton label="Zoom in" onClick={() => controller.zoomIn()}>
          +
        </HudButton>
        <HudButton label="Zoom out" onClick={() => controller.zoomOut()}>
          −
        </HudButton>
        <HudButton label="Reset view" onClick={() => controller.resetView()}>
          🏠
        </HudButton>
        {canFullscreen && (
          <HudButton
            label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFullscreen}
          >
            <FullscreenIcon exit={isFullscreen} />
          </HudButton>
        )}
      </nav>
    </>
  );
}
