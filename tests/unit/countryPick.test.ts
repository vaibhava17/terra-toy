import { beforeAll, describe, expect, it } from 'vitest';
import {
  boxContains,
  buildCountryIndex,
  type CountryIndex,
} from '../../src/engine/globe/countryPick';
import { buildCountrySet, loadCountrySet, type CountrySet } from '../../src/engine/globe/countries';
import type { BorderLevel } from '../../src/engine/globe/borderMath';

describe('boxContains', () => {
  it('handles ordinary boxes', () => {
    const box = { west: -10, south: 40, east: 10, north: 50 };
    expect(boxContains(box, 45, 0)).toBe(true);
    expect(boxContains(box, 45, 11)).toBe(false);
    expect(boxContains(box, 51, 0)).toBe(false);
  });

  it('handles boxes crossing the antimeridian (west > east)', () => {
    const box = { west: 170, south: -20, east: -170, north: -10 };
    expect(boxContains(box, -15, 175)).toBe(true);
    expect(boxContains(box, -15, -175)).toBe(true);
    expect(boxContains(box, -15, 180)).toBe(true);
    expect(boxContains(box, -15, 0)).toBe(false);
    expect(boxContains(box, -15, 160)).toBe(false);
  });
});

/** Real places: [label, lat, lng, expected Natural Earth name or null for the sea]. */
const PLACES: ReadonlyArray<readonly [string, number, number, string | null]> = [
  ['Paris', 48.8566, 2.3522, 'France'],
  ['Delhi', 28.6139, 77.209, 'India'],
  ['Brasília', -15.7939, -47.8828, 'Brazil'],
  ['mid-Atlantic', 30, -40, null],
  ['south Pacific', -40, -130, null],
  ['Chukotka (Russia, east of 180°)', 65.5, -175, 'Russia'],
  ['Wrangel Island (Russia, east of 180°)', 71.3, -179.5, 'Russia'],
  ['Siberia (Russia, west of 180°)', 68, 179.5, 'Russia'],
  ['Viti Levu, Fiji', -17.83, 178.0, 'Fiji'],
  ['Fairbanks, Alaska', 64.84, -147.72, 'United States of America'],
  ['Kansas', 38.5, -98, 'United States of America'],
];

describe.each<BorderLevel>(['110m', '50m'])('country index (%s)', (level) => {
  let set: CountrySet;
  let index: CountryIndex;

  beforeAll(async () => {
    set = await loadCountrySet(level);
    index = buildCountryIndex(set.countries);
  });

  it.each(PLACES)('%s', (_label, lat, lng, expected) => {
    expect(index.pick(lat, lng)?.name ?? null).toBe(expected);
  });

  it('gives every country a non-empty id and name', () => {
    expect(set.countries.length).toBeGreaterThan(150);
    for (const c of set.countries) {
      expect(c.id).not.toBe('');
      expect(c.name).not.toBe('');
    }
    expect(index.pick(48.8566, 2.3522)?.id).toBe('250'); // ISO 3166-1 numeric for France
  });

  it('returns null for non-finite input', () => {
    expect(index.pick(NaN, 0)).toBeNull();
    expect(index.pick(0, Infinity)).toBeNull();
  });

  it('finds a country picked at another resolution by id (and name)', async () => {
    const other = await loadCountrySet(level === '110m' ? '50m' : '110m');
    const france = buildCountryIndex(other.countries).pick(46.6, 2.4)!;
    expect(index.find({ id: france.id, name: france.name })?.name).toBe('France');
    expect(index.find({ id: 'nope', name: 'Nowhere' })).toBeUndefined();
  });

  it('outlines a country as lines (its own arcs)', () => {
    const france = index.pick(46.6, 2.4)!;
    const outline = france.outline();
    expect(outline.type).toBe('MultiLineString');
    expect(outline.coordinates.length).toBeGreaterThan(0);
    expect(france.outline()).toBe(outline); // cached
  });
});

describe('country index (50m only)', () => {
  it('picks the Fiji islands east of 180°', async () => {
    const index = buildCountryIndex((await loadCountrySet('50m')).countries);
    expect(index.pick(-16.809, -179.922)?.name).toBe('Fiji');
  });
});

describe('buildCountrySet', () => {
  it('rejects a topology without a countries collection', () => {
    const topo = { type: 'Topology', objects: {}, arcs: [] } as unknown as Parameters<
      typeof buildCountrySet
    >[0];
    expect(() => buildCountrySet(topo, '110m')).toThrow(/countries/);
  });
});
