/**
 * Every landmark in `content/landmarks/*.json`, validated against the Zod schema and
 * sorted by id. Vite (and Vitest) inline the JSON at build time, so there is no fetch;
 * a bad file fails loudly at import (and in the unit tests long before that).
 *
 * The UI imports this module only lazily (with the engine), so zod and the content
 * stay out of the first-paint bundle.
 */
import { parseLandmarkFiles, type LandmarkData } from './schema';

const files = import.meta.glob<unknown>('/content/landmarks/*.json', {
  eager: true,
  import: 'default',
});

export const LANDMARKS: readonly LandmarkData[] = Object.freeze(parseLandmarkFiles(files));

const byId = new Map(LANDMARKS.map((lm) => [lm.id, lm]));

/** The landmark with this id, or undefined. */
export function findLandmark(id: string | null | undefined): LandmarkData | undefined {
  return id ? byId.get(id) : undefined;
}
