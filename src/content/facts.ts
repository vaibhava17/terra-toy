/**
 * Kid-friendly labels for content fact keys and values, e.g.
 * `{ key: 'height_m', value: 330 }` → "Height" / "330 m". Pure (no DOM, no zod), so the
 * UI can import it cheaply. Tested in tests/unit/content.test.ts.
 */
import type { ContinentId } from './schema';

/** Label per fact key, without the unit suffix. Keys not listed here get a generated label. */
export const FACT_LABELS: Readonly<Record<string, string>> = {
  built: 'Built',
  carved: 'Carved',
  completed: 'Finished',
  opened: 'Opened',
  unveiled: 'Unveiled',
  rebuilt: 'Rebuilt',
  height: 'Height',
  height_with_base: 'Height with its base',
  original_height: 'Height when built',
  elevation: 'Height above the sea',
  main_span: 'Longest span',
  total_length: 'Whole length',
  material: 'Made of',
  architect: 'Designed by',
  last_eruption: 'Last eruption',
  statues: 'Statues',
  record: 'Record',
};

/** Unit suffixes a fact key may end with, and how the unit is written. */
const UNITS: ReadonlyArray<readonly [suffix: string, unit: string]> = [
  ['_km', 'km'],
  ['_m', 'm'],
];

/** Splits `height_m` into `{ base: 'height', unit: 'm' }`. */
function splitUnit(key: string): { base: string; unit: string | null } {
  for (const [suffix, unit] of UNITS) {
    if (key.endsWith(suffix) && key.length > suffix.length) {
      return { base: key.slice(0, -suffix.length), unit };
    }
  }
  return { base: key, unit: null };
}

/** `last_eruption` → "Last eruption" (used for keys without a hand-written label). */
const humanise = (base: string): string => {
  const words = base.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export interface FormattedFact {
  label: string;
  value: string;
}

/**
 * A fact as the card shows it. Numbers with a unit get thousands separators (except
 * year-like keys, which are never unit-suffixed), so 5895 → "5,895 m".
 */
export function formatFact(fact: { key: string; value: string | number }): FormattedFact {
  const { base, unit } = splitUnit(fact.key);
  const label = FACT_LABELS[base] ?? humanise(base);
  let value: string;
  if (typeof fact.value === 'number') {
    value = unit ? fact.value.toLocaleString('en-US') : String(fact.value);
  } else {
    value = fact.value;
  }
  return { label, value: unit ? `${value} ${unit}` : value };
}

/** True if `key` has a hand-written label (used by the content test to catch typos). */
export function hasFactLabel(key: string): boolean {
  return splitUnit(key).base in FACT_LABELS;
}

export const CONTINENT_NAMES: Readonly<Record<ContinentId, string>> = {
  africa: 'Africa',
  asia: 'Asia',
  europe: 'Europe',
  'north-america': 'North America',
  'south-america': 'South America',
  oceania: 'Oceania',
  antarctica: 'Antarctica',
};
