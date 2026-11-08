/**
 * Zod schemas for the hand-authored content in `content/` (PLAN §3.2). The JSON files
 * are the source of truth; these schemas are what CI and the app check them against.
 * Pure: no DOM, no three.js. Tested in tests/unit/content.test.ts.
 *
 * Uses `zod/mini` (the tree-shakable functional API): the app validates content at
 * runtime, and classic zod made the lazy content chunk 31 kB gzipped instead of 14 kB.
 */
import { z } from 'zod/mini';

/** Lower-case words joined by single hyphens, e.g. `eiffel-tower`. */
export const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Lower-case words joined by single underscores, e.g. `height_m`. */
const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

const range = (lo: number, hi: number) => z.number().check(z.gte(lo), z.lte(hi));
const text = () => z.string().check(z.trim(), z.minLength(1));
const pattern = (re: RegExp, message: string) => z.string().check(z.regex(re, message));

export const LatLng = z.strictObject({
  lat: range(-90, 90),
  lng: range(-180, 180),
});

/** Text per locale; English is required, other locales are optional. */
export const I18nText = z.catchall(z.object({ en: text() }), text());

/** An absolute http(s) URL. */
const HttpUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

export const Credit = z.strictObject({
  url: HttpUrl,
  author: text(),
  license: z.enum([
    'CC0',
    'PD',
    'CC-BY-2.0',
    'CC-BY-3.0',
    'CC-BY-4.0',
    'CC-BY-SA-3.0',
    'CC-BY-SA-4.0',
  ]),
});

/** One checkable fact; every fact carries the URL it was checked against (PLAN §6). */
export const Fact = z.strictObject({
  /** snake_case; a `_m` / `_km` suffix is the unit (see src/content/facts.ts). */
  key: pattern(SNAKE_CASE, 'fact key must be snake_case'),
  value: z.union([text(), z.number()]),
  source: HttpUrl,
});

export const CONTINENTS = [
  'africa',
  'asia',
  'europe',
  'north-america',
  'south-america',
  'oceania',
  'antarctica',
] as const;
export const Continent = z.enum(CONTINENTS);

export const LANDMARK_CATEGORIES = [
  'tower',
  'statue',
  'monument',
  'ancient',
  'temple',
  'palace',
  'wall',
  'mountain',
  'bridge',
  'building',
] as const;
export const LandmarkCategory = z.enum(LANDMARK_CATEGORIES);

export const Landmark = z.strictObject({
  id: pattern(KEBAB_CASE, 'id must be kebab-case'),
  kind: z.literal('landmark'),
  category: LandmarkCategory,
  pos: LatLng,
  /** Model yaw in degrees clockwise from north. */
  heading: z.number().check(z.gte(0), z.lt(360)),
  /** ISO 3166-1 alpha-2, upper case. */
  country: pattern(/^[A-Z]{2}$/, 'country must be an ISO 3166-1 alpha-2 code'),
  continent: Continent,
  /** Model builder id (e.g. `landmarks/eiffel`); until models land, pins are drawn instead. */
  model: z.optional(text()),
  scale: z.optional(z.number().check(z.positive())),
  /**
   * Shown only from this zoom level in (see `zoomLevelForDistance` in
   * src/engine/entities/landmarkMath.ts). Omitted: visible at every zoom.
   */
  minZoom: z.optional(z.number().check(z.gte(0))),
  name: I18nText,
  blurb: I18nText,
  facts: z.array(Fact).check(z.minLength(1)),
  photo: z.optional(z.strictObject({ file: text(), credit: Credit })),
  birthday: z.optional(z.iso.date()),
  tags: z.array(pattern(KEBAB_CASE, 'tags must be kebab-case')),
  quiz: z.strictObject({ difficulty: z.int().check(z.gte(1), z.lte(3)) }),
  verified: z.strictObject({ by: z.enum(['agent', 'human']), date: z.iso.date() }),
});

export type LatLngData = z.infer<typeof LatLng>;
export type I18nTextData = z.infer<typeof I18nText>;
export type FactData = z.infer<typeof Fact>;
export type ContinentId = z.infer<typeof Continent>;
export type LandmarkCategoryId = z.infer<typeof LandmarkCategory>;
export type LandmarkData = z.infer<typeof Landmark>;

/** `content/landmarks/eiffel-tower.json` → `eiffel-tower`. */
export function idFromPath(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.endsWith('.json') ? file.slice(0, -'.json'.length) : file;
}

/**
 * Validates a set of landmark files (path → parsed JSON): each must match the schema,
 * its id must equal its file name, and ids must be unique. Throws one Error listing
 * every problem; returns the landmarks sorted by id.
 */
export function parseLandmarkFiles(files: Readonly<Record<string, unknown>>): LandmarkData[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const out: LandmarkData[] = [];
  for (const [path, json] of Object.entries(files)) {
    const result = Landmark.safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push(`${path}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      continue;
    }
    const lm = result.data;
    const fileId = idFromPath(path);
    if (lm.id !== fileId) problems.push(`${path}: id "${lm.id}" does not match file name`);
    const other = seen.get(lm.id);
    if (other !== undefined) {
      problems.push(`${path}: duplicate id "${lm.id}" (also in ${other})`);
      continue;
    }
    seen.set(lm.id, path);
    out.push(lm);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid landmark content:\n  ${problems.join('\n  ')}`);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
