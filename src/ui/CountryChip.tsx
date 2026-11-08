import { store } from '../state/store';
import { useStore } from './useStore';

/**
 * Bottom-centre name badge. A selected (tapped) country shows a bold chip with a close
 * button and is announced politely to screen readers; otherwise a hovered country shows
 * a lighter, silent tag (hover changes too often to announce).
 */
export function CountryChip() {
  const selected = useStore((s) => s.globe.selectedCountry);
  const hovered = useStore((s) => s.globe.hoveredCountry);

  return (
    <div class="country-chip-area">
      <div aria-live="polite" aria-atomic="true">
        {selected && (
          <div class="country-chip" data-testid="country-chip">
            <span class="country-chip-pin" aria-hidden="true">
              📍
            </span>
            <span class="country-chip-name">{selected.name}</span>
            <button
              type="button"
              class="country-chip-close"
              aria-label={`Close ${selected.name}`}
              title="Close"
              onClick={() => store.getState().setSelectedCountry(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}
      </div>
      {!selected && hovered && (
        <div class="country-tag" aria-hidden="true">
          {hovered.name}
        </div>
      )}
    </div>
  );
}
