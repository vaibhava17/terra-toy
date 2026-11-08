import type { ComponentChildren, Ref } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { LandmarkData } from '../content/schema';
import type { GlobeController } from '../engine/view';
import { store } from '../state/store';
import { CountryChip } from './CountryChip';
import { InfoCard } from './InfoCard';
import { LandmarkList } from './LandmarkList';

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
  /** For toggles: whether the thing it opens is open (sets aria-expanded). */
  expanded?: boolean;
  controls?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}

function HudButton({ label, onClick, children, expanded, controls, buttonRef }: HudButtonProps) {
  return (
    <button
      type="button"
      class="hud-button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
      ref={buttonRef}
      onClick={onClick}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

interface HudProps {
  controller: GlobeController;
  landmarks: readonly LandmarkData[];
}

/**
 * Round on-screen controls (bottom-right) with the landmark menu, the title badge, the
 * country name chip and the landmark info card.
 */
export function Hud({ controller, landmarks }: HudProps) {
  const [canFullscreen] = useState(fullscreenSupported);
  const [isFullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    if (!canFullscreen) return;
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [canFullscreen]);

  const [listOpen, setListOpen] = useState(false);
  const [cardFocusRequest, setCardFocusRequest] = useState(0);
  const listButtonRef = useRef<HTMLButtonElement>(null);
  const closeList = useCallback(() => {
    setListOpen(false);
    listButtonRef.current?.focus();
  }, []);
  const pickLandmark = (id: string) => {
    setListOpen(false);
    // Re-picking the open landmark doesn't change the store, so fly there directly.
    if (store.getState().globe.selectedLandmark === id) controller.flyToLandmark(id);
    else store.getState().setSelectedLandmark(id);
    setCardFocusRequest((n) => n + 1);
  };

  return (
    <>
      <div class="title-badge">
        <span aria-hidden="true">🌍</span> Terra Toy
      </div>
      <nav class="hud" aria-label="Globe controls">
        <HudButton
          label="Landmarks"
          expanded={listOpen}
          controls="landmark-list"
          buttonRef={listButtonRef}
          onClick={() => setListOpen((open) => !open)}
        >
          🏛️
        </HudButton>
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
      {listOpen && <LandmarkList landmarks={landmarks} onPick={pickLandmark} onClose={closeList} />}
      <CountryChip />
      <InfoCard
        landmarks={landmarks}
        controller={controller}
        focusRequest={cardFocusRequest}
        returnFocusRef={listButtonRef}
      />
    </>
  );
}
