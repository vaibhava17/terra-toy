import { useEffect } from 'preact/hooks';
import type { LandmarkData } from '../content/schema';
import { landmarkEmoji } from './landmarkText';

interface LandmarkListProps {
  landmarks: readonly LandmarkData[];
  /** The landmark the player chose. */
  onPick: (id: string) => void;
  onClose: () => void;
}

/** A small pop-up menu of every landmark, next to the HUD (also the keyboard route to them). */
export function LandmarkList({ landmarks, onPick, onClose }: LandmarkListProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capture phase + preventDefault: the info card (bubble phase) leaves this key alone.
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const sorted = [...landmarks].sort((a, b) => a.name.en.localeCompare(b.name.en, 'en'));
  return (
    <div id="landmark-list" class="landmark-list" role="region" aria-label="Landmarks">
      <ul>
        {sorted.map((lm) => (
          <li key={lm.id}>
            <button type="button" class="landmark-list-item" onClick={() => onPick(lm.id)}>
              <span aria-hidden="true">{landmarkEmoji(lm)}</span>
              <span>{lm.name.en}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
