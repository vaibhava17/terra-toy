/**
 * Display helpers for landmarks in the UI: category emoji (with per-landmark overrides),
 * country and continent names, and a short label for a fact's source link. Type-only
 * imports from the content schema, so zod never lands in the first-paint bundle.
 */
import { CONTINENT_NAMES } from '../content/facts';
import type { LandmarkCategoryId, LandmarkData } from '../content/schema';

export const CATEGORY_EMOJI: Readonly<Record<LandmarkCategoryId, string>> = {
  tower: '🗼',
  statue: '🗿',
  monument: '🏛️',
  ancient: '🏺',
  temple: '🛕',
  palace: '🏯',
  wall: '🧱',
  mountain: '🏔️',
  bridge: '🌉',
  building: '🎭',
};

/**
 * Landmarks whose category emoji would picture a different landmark (🗼 is a lattice
 * tower, 🗽 is one particular statue) get their own icon.
 */
const LANDMARK_EMOJI: Readonly<Record<string, string>> = {
  'big-ben': '🕰️',
  'burj-khalifa': '🏙️',
  'christ-the-redeemer': '⛪',
  'statue-of-liberty': '🗽',
};

/** The icon shown for a landmark on its card and in the list. */
export function landmarkEmoji(lm: Pick<LandmarkData, 'id' | 'category'>): string {
  return LANDMARK_EMOJI[lm.id] ?? CATEGORY_EMOJI[lm.category];
}

let regionNames: Intl.DisplayNames | null | undefined;

/** English country name for an ISO 3166-1 alpha-2 code (falls back to the code). */
export function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "France · Europe" */
export function placeLine(lm: LandmarkData): string {
  return `${countryName(lm.country)} · ${CONTINENT_NAMES[lm.continent]}`;
}

/** "Wikipedia" for Wikipedia links, else the bare host name. */
export function sourceLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return /(^|\.)wikipedia\.org$/.test(host) ? 'Wikipedia' : host;
  } catch {
    return 'Source';
  }
}
