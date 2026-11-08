import { beforeAll, describe, expect, it } from 'vitest';
import { buildCountryIndex, type CountryIndex } from '../../src/engine/globe/countryPick';
import { loadCountrySet } from '../../src/engine/globe/countries';
import type { BorderLevel } from '../../src/engine/globe/borderMath';
import {
  DISPUTED_AREAS,
  DISPUTED_COASTS,
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

/**
 * world-atlas land just off a disputed area's 10m coast: outside the core, but world-atlas
 * tags it with the area's claimant, so before the coast fringe the chip showed that name.
 * [label, lat, lng, world-atlas name at 110m, at 50m]; null = sea at that level, where the
 * point must stay sea.
 */
const COASTAL: ReadonlyArray<readonly [string, number, number, string | null, string | null]> = [
  ['Crimea south coast', 44.37, 33.86, 'Russia', null],
  ['Crimea south coast (Yalta)', 44.4, 33.85, 'Russia', 'Russia'],
  ['Crimea south coast (Alushta)', 44.75, 34.55, 'Russia', 'Russia'],
  ['Crimea west coast', 45.35, 32.9, 'Russia', 'Russia'],
  ['Falklands, West Falkland south coast', -52.0, -60.8, 'Falkland Is.', 'Falkland Is.'],
  ['Falklands, East Falkland south coast', -52.05, -58.8, 'Falkland Is.', 'Falkland Is.'],
  ['Kunashir south-west coast', 43.7, 145.4, 'Japan', null],
  ['Habomai islets', 43.45, 145.9, null, 'Russia'],
  ['Shikotan north-west coast', 44.5, 147.05, null, 'Russia'],
];

/**
 * Near a disputed coast but not part of it: the fringe must leave these alone.
 * [label, lat, lng, name at 110m, at 50m] (null = sea).
 */
const NEAR_COAST: ReadonlyArray<readonly [string, number, number, string | null, string | null]> = [
  ['Black Sea south of Crimea', 43.5, 33.5, null, null],
  ['Taman peninsula (east of the Kerch Strait)', 45.2, 37.0, 'Russia', 'Russia'],
  ['Taman peninsula, west end', 45.25, 36.9, 'Russia', 'Russia'],
  ['Odesa (inland)', 46.45, 30.6, 'Ukraine', 'Ukraine'],
  ['Nemuro, Hokkaido', 43.3, 145.4, 'Japan', null],
  ['Shiretoko, Hokkaido', 44.05, 145.1, 'Japan', 'Japan'],
];

/**
 * Natural Earth lists these too, but they are leases, buffer zones or undisputed
 * subunits, not disputes: [label, lat, lng, name at 110m, at 50m] (null = sea), each
 * inside the Natural Earth polygon named in the label.
 */
const NOT_DISPUTES: ReadonlyArray<readonly [string, number, number, string | null, string | null]> =
  [
    ['Baikonur (Baykonur)', 45.965, 63.305, 'Kazakhstan', 'Kazakhstan'],
    ['Ceuta', 35.885, -5.33, null, 'Morocco'],
    ['Melilla', 35.29, -2.95, null, 'Morocco'],
    ['Panmunjom (Korean Demilitarized Zone)', 37.956, 126.677, 'North Korea', 'North Korea'],
    ['UNDOF Zone near Quneitra', 33.12, 35.82, 'Israel', 'Israel'],
    ['UNDOF Zone, south', 33.0, 35.86, 'Syria', 'Israel'],
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
    // 99 Natural Earth features, 8 whole territories and 7 non-disputes left out; the two
    // W. Sahara pieces share a name.
    expect(names.size).toBe(83);
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

  it('leaves out leases, buffer zones and undisputed subunits', () => {
    const names = new Set(DISPUTED_AREAS.map((a) => a.name));
    for (const n of [
      'Baykonur',
      'Ceuta',
      'Melilla',
      'Korean Demilitarized Zone (north)',
      'Korean Demilitarized Zone (south)',
      'Korean islands under UN jurisdiction',
      'UNDOF Zone',
    ]) {
      expect(names.has(n), n).toBe(false);
    }
    // A lease that is also claimed stays.
    expect(names.has('Guantanamo Bay USNB')).toBe(true);
  });

  it.each(NOT_DISPUTES)('%s is not (not a dispute)', (_label, lat, lng) => {
    expect(disputedAreaAt(lat, lng)).toBeNull();
  });

  it.each(COASTAL)('%s is outside the 10m core (the fringe handles it)', (_label, lat, lng) => {
    expect(disputedAreaAt(lat, lng)).toBeNull();
  });

  it('is null over the sea and for non-finite input', () => {
    expect(disputedAreaAt(30, -40)).toBeNull();
    expect(disputedAreaAt(NaN, 77)).toBeNull();
  });
});

describe('DISPUTED_COASTS', () => {
  it('belongs to kept areas and lists the world-atlas names of their core', () => {
    const names = new Set(DISPUTED_AREAS.map((a) => a.name));
    const coastOf = new Map(DISPUTED_COASTS.map((c) => [c.name, c.coast]));
    for (const c of DISPUTED_COASTS) {
      expect(names.has(c.name), c.name).toBe(true);
      expect(c.coast?.size, c.name).toBeGreaterThan(0);
    }
    expect([...(coastOf.get('Crimea') ?? [])]).toEqual(['Russia']);
    expect([...(coastOf.get('Falkland Is.') ?? [])]).toEqual(['Falkland Is.']);
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

  it.each(COASTAL)(
    '%s, on the coarse world-atlas coast, shows the neutral label',
    (_label, lat, lng, at110m, at50m) => {
      const raw = level === '110m' ? at110m : at50m;
      // The point exercises the fringe: world-atlas says the claimant (or sea)…
      expect(index.pick(lat, lng)?.name ?? null).toBe(raw);
      // …and the chip is neutral on land, and sea stays sea.
      expect(pickCountryRef(index, lat, lng)).toEqual(raw === null ? null : DISPUTED_REF);
    },
  );

  it.each(NEAR_COAST)('%s keeps its name (or stays sea)', (_label, lat, lng, at110m, at50m) => {
    expect(pickCountryRef(index, lat, lng)?.name ?? null).toBe(level === '110m' ? at110m : at50m);
  });

  it.each(NOT_DISPUTES)(
    '%s keeps the world-atlas name, not "Disputed area"',
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
