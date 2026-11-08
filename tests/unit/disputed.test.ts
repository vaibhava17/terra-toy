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

/** Points in disputed areas: [label, lat, lng, Natural Earth disputed-area name]. */
const DISPUTED: ReadonlyArray<readonly [string, number, number, string]> = [
  // Kashmir region (PR #6).
  ['Siachen Glacier', 35.42, 77.1, 'Siachen Glacier'],
  ['Srinagar', 34.0837, 74.7973, 'Jammu and Kashmir'],
  ['Leh', 34.1526, 77.577, 'Jammu and Kashmir'],
  ['Muzaffarabad', 34.37, 73.47, 'Azad Kashmir'],
  ['Gilgit', 35.92, 74.31, 'Gilgit-Baltistan'],
  ['Aksai Chin', 35.0, 79.3, 'Aksai Chin'],
  ['Shaksam Valley', 36.1, 76.6, 'Shaksam Valley'],
  // The rest of Natural Earth's list (spot checks).
  ['Simferopol', 44.952, 34.102, 'Crimea'],
  ['Sevastopol', 44.6, 33.52, 'Crimea'],
  ['Laayoune', 27.154, -13.2, 'W. Sahara'],
  ['Katzrin', 32.99, 35.69, 'Golan Heights'],
  ['Itanagar', 27.084, 93.605, 'Arunachal Pradesh'],
  ['Kyrenia', 35.33, 33.32, 'N. Cyprus'],
  ['Stanley', -51.693, -57.86, 'Falkland Is.'],
  ['Iturup', 45.0, 147.9, 'Kuril Is.'],
  ['Sukhumi', 43.0, 41.02, 'Abkhazia'],
  ['Tiraspol', 46.84, 29.63, 'Transnistria'],
  ['Shebaa Farms', 33.3, 35.68, 'Shebaa Farms'],
];

/**
 * Whole territories Natural Earth also flags as disputed. They are left out of the
 * overlay on purpose (Vaibhav, 09 Nov) and show their normal country name, as before:
 * [label, lat, lng, country name in world-atlas at 110m, at 50m]. Coastal cities use a
 * point a few km inland, as the coarse coastlines put the city centre in the sea. The
 * Gaza Strip is too small to be land at 110m at all, so there it is sea (null), as it
 * was before the overlay.
 */
const WHOLE_TERRITORY: ReadonlyArray<
  readonly [string, number, number, string | null, string | null]
> = [
  ['Taipei', 25.033, 121.565, 'Taiwan', 'Taiwan'],
  ['Kaohsiung (inland)', 22.75, 120.45, 'Taiwan', 'Taiwan'],
  ['Tel Aviv', 32.0853, 34.7818, 'Israel', 'Israel'],
  ['Pristina', 42.6629, 21.1655, 'Kosovo', 'Kosovo'],
  ['Hargeisa', 9.56, 44.065, 'Somaliland', 'Somaliland'],
  ['Belize City (inland)', 17.5, -88.3, 'Belize', 'Belize'],
  ['Gaza City', 31.5017, 34.4668, null, 'Palestine'],
  ['Ramallah', 31.9038, 35.2034, 'Palestine', 'Palestine'],
  ['Kota Kinabalu (inland)', 5.95, 116.2, 'Malaysia', 'Malaysia'],
];

/** Undisputed places nearby that must keep their country name. */
const UNDISPUTED: ReadonlyArray<readonly [string, number, number, string]> = [
  ['Delhi', 28.6139, 77.209, 'India'],
  ['Lahore', 31.5204, 74.3587, 'Pakistan'],
  ['Islamabad', 33.6844, 73.0479, 'Pakistan'],
  ['Lhasa', 29.65, 91.1, 'China'],
  ['Paris', 48.8566, 2.3522, 'France'],
  ['Kyiv', 50.45, 30.52, 'Ukraine'],
  ['Moscow', 55.76, 37.62, 'Russia'],
  ['Beijing', 39.9, 116.4, 'China'],
  ['Rabat', 34.02, -6.84, 'Morocco'],
  ['Damascus', 33.51, 36.29, 'Syria'],
  ['Tokyo', 35.68, 139.69, 'Japan'],
  ['Buenos Aires', -34.6, -58.38, 'Argentina'],
];

describe('disputedAreaAt', () => {
  it('carries the Natural Earth border disputes, not just Kashmir', () => {
    const names = new Set(DISPUTED_AREAS.map((a) => a.name));
    // 99 Natural Earth features, 8 whole territories left out; the two W. Sahara pieces
    // share a name.
    expect(names.size).toBe(90);
    expect([...names]).toEqual(
      expect.arrayContaining([
        'Siachen Glacier',
        'Jammu and Kashmir',
        'Gilgit-Baltistan',
        'Crimea',
        'W. Sahara',
        'Golan Heights',
        'N. Cyprus',
        'Arunachal Pradesh',
        'Kuril Is.',
        'Falkland Is.',
      ]),
    );
  });

  it.each(DISPUTED)('%s is in a disputed area', (_label, lat, lng, area) => {
    expect(disputedAreaAt(lat, lng)?.name).toBe(area);
  });

  it.each(UNDISPUTED)('%s is not', (_label, lat, lng) => {
    expect(disputedAreaAt(lat, lng)).toBeNull();
  });

  it('leaves out the whole territories Natural Earth flags', () => {
    const names = new Set(DISPUTED_AREAS.map((a) => a.name));
    for (const n of [
      'Taiwan',
      'Israel',
      'Kosovo',
      'Somaliland',
      'Gaza',
      'West Bank',
      'Belize',
      'North Borneo',
    ]) {
      expect(names.has(n), n).toBe(false);
    }
  });

  it.each(WHOLE_TERRITORY)('%s is not (whole territory)', (_label, lat, lng) => {
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

  it.each(WHOLE_TERRITORY)(
    '%s shows its normal country name, not "Disputed area"',
    (_label, lat, lng, at110m, at50m) => {
      const ref = pickCountryRef(index, lat, lng);
      expect(ref?.name).not.toBe(DISPUTED_LABEL);
      expect(ref?.name ?? null).toBe(level === '110m' ? at110m : at50m);
    },
  );

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
