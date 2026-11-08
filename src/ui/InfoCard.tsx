import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { formatFact } from '../content/facts';
import type { LandmarkData } from '../content/schema';
import type { GlobeController } from '../engine/view';
import { store } from '../state/store';
import { CATEGORY_EMOJI, placeLine, sourceLabel } from './landmarkText';
import { useStore } from './useStore';

interface InfoCardProps {
  landmarks: readonly LandmarkData[];
  controller: GlobeController;
  /** Bumped when the player picked a landmark from a menu: move keyboard focus to the card. */
  focusRequest: number;
  /** Where focus goes when the card closes while it holds focus. */
  returnFocusRef: RefObject<HTMLElement | null>;
}

/**
 * The info card for the selected landmark: a panel at the top-left on wide screens and
 * a bottom sheet on narrow ones. It is a non-modal dialog: the globe stays usable, Escape
 * or × closes it, and it only takes keyboard focus when opened from the landmark menu.
 */
export function InfoCard({ landmarks, controller, focusRequest, returnFocusRef }: InfoCardProps) {
  const selectedId = useStore((s) => s.globe.selectedLandmark);
  const landmark = selectedId ? landmarks.find((lm) => lm.id === selectedId) : undefined;
  const cardRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const close = () => {
    const card = cardRef.current;
    const hadFocus = !!card && card.contains(document.activeElement);
    store.getState().setSelectedLandmark(null);
    if (hadFocus) returnFocusRef.current?.focus();
  };

  // Escape closes the card (listening on the document, as the card rarely has focus).
  useEffect(() => {
    if (!landmark) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // A new landmark starts at the top of the card.
  useEffect(() => {
    if (cardRef.current) cardRef.current.scrollTop = 0;
  }, [selectedId]);

  useEffect(() => {
    if (focusRequest > 0) titleRef.current?.focus();
  }, [focusRequest]);

  const name = landmark?.name.en ?? '';
  return (
    <>
      <p class="visually-hidden" aria-live="polite">
        {landmark ? `${name} card open` : ''}
      </p>
      {landmark && (
        <section
          ref={cardRef}
          class="info-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby="info-card-title"
          data-testid="info-card"
        >
          <header class="info-card-header">
            <span class="info-card-emoji" aria-hidden="true">
              {CATEGORY_EMOJI[landmark.category]}
            </span>
            <div class="info-card-heading">
              <h2 id="info-card-title" ref={titleRef} tabIndex={-1}>
                {name}
              </h2>
              <p class="info-card-place">{placeLine(landmark)}</p>
            </div>
            <button
              type="button"
              class="info-card-close"
              aria-label={`Close ${name}`}
              title="Close"
              onClick={close}
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <p class="info-card-blurb">{landmark.blurb.en}</p>
          <dl class="info-card-facts">
            {landmark.facts.map((fact) => {
              const { label, value } = formatFact(fact);
              return (
                <div class="info-card-fact" key={fact.key}>
                  <dt>{label}</dt>
                  <dd>
                    <span>{value}</span>
                    <a
                      class="info-card-source"
                      href={fact.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${label}: source (${sourceLabel(fact.source)}, opens in a new tab)`}
                    >
                      {sourceLabel(fact.source)}
                    </a>
                  </dd>
                </div>
              );
            })}
          </dl>
          <button
            type="button"
            class="info-card-fly"
            onClick={() => controller.flyToLandmark(landmark.id)}
          >
            <span aria-hidden="true">✈️</span> Fly there
          </button>
        </section>
      )}
    </>
  );
}
