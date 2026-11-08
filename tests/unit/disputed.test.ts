import { beforeAll, describe, expect, it } from 'vitest';
import { buildCountryIndex, type CountryIndex } from '../../src/engine/globe/countryPick';
import { loadCountrySet } from '../../src/engine/globe/countries';
import type { BorderLevel } from '../../src/engine/globe/borderMath';
import {
  DISPUTED_AREAS,
  DISPUTED_LABEL,
  DISPUTED_REF,
  disputedAreaAt,
  pickCountryRef,
} from '../../src/engine/globe/disputed';
import { sameCountry } from '../../src/engine/view';

/** Points in the Kashmir region: [label, lat, lng, Natural Earth disputed-area name]. */
const DISPUTED: ReadonlyArray<readonly [string, number, number, string]> = [
  ['Siachen Glacier', 35.42, 77.1, 'Siachen Glacier'],
  ['Srinagar', 34.0837, 74.7973, 'Jammu and Kashmir'],
  ['Leh', 34.1526, 77.577, 'Jammu and Kashmir'],
  ['Muzaffarabad', 34.37, 73.47, 'Azad Kashmir'],
  ['Gilgit', 35.92, 74.31, 'Gilgit-Baltistan'],
  ['Aksai Chin', 35.0, 79.3, 'Aksai Chin'],
  ['Shaksam Valley', 36.1, 76.6, 'Shaksam Valley'],
];

/** Undisputed places nearby that must keep their country name. */
const UNDISPUTED: ReadonlyArray<readonly [string, number, number, string]> = [
  ['Delhi', 28.6139, 77.209, 'India'],
  ['Lahore', 31.5204, 74.3587, 'Pakistan'],
  ['Islamabad', 33.6844, 73.0479, 'Pakistan'],
  ['Lhasa', 29.65, 91.1, 'China'],
  ['Paris', 48.8566, 2.3522, 'France'],
];

describe('disputedAreaAt', () => {
  it('carries the Kashmir-region areas', () => {
    expect(DISPUTED_AREAS.map((a) => a.name)).toEqual(
      expect.arrayContaining(['Siachen Glacier', 'Jammu and Kashmir', 'Gilgit-Baltistan']),
    );
  });

  it.each(DISPUTED)('%s is in a disputed area', (_label, lat, lng, area) => {
    expect(disputedAreaAt(lat, lng)?.name).toBe(area);
  });

  it.each(UNDISPUTED)('%s is not', (_label, lat, lng) => {
    expect(disputedAreaAt(lat, lng)).toBeNull();
  });

  it('is null over the sea and for non-finite input', () => {
    expect(disputedAreaAt(30, -40)).toBeNull();
    expect(disputedAreaAt(NaN, 77)).toBeNull();
  });
});

describe.each<BorderLevel>(['110m', '50m'])('pickCountryRef (%s)', (level) => {
  let index: CountryIndex;

  beforeAll(async () => {
    index = buildCountryIndex((await loadCountrySet(level)).countries);
  });

  it.each(DISPUTED)('%s shows the neutral label, not a claimant', (_label, lat, lng) => {
    // The raw data still tags the point with some country (that is the bug being fixed)…
    const raw = index.pick(lat, lng)?.name;
    // …but what reaches the store and the name chip is neutral.
    const ref = pickCountryRef(index, lat, lng);
    expect(ref).toEqual({ id: 'disputed', name: DISPUTED_LABEL });
    expect(ref?.name).toBe('Disputed area');
    if (raw) expect(ref?.name).not.toBe(raw);
  });

  it.each(UNDISPUTED)('%s keeps its country name', (_label, lat, lng, name) => {
    expect(pickCountryRef(index, lat, lng)?.name).toBe(name);
  });

  it('returns null over the sea', () => {
    expect(pickCountryRef(index, 30, -40)).toBeNull();
  });

  it('never resolves the neutral ref to a claimant shape (no claimant outline)', () => {
    expect(index.find(DISPUTED_REF)).toBeUndefined();
  });
});

describe('DISPUTED_REF', () => {
  it('is one ref for all areas, so moving between them is not a change', () => {
    const a = pickCountryRef(buildCountryIndex([]), 35.42, 77.1); // Siachen
    const b = pickCountryRef(buildCountryIndex([]), 34.0837, 74.7973); // Srinagar
    expect(sameCountry(a, b)).toBe(true);
  });
});
