/**
 * Content validation (PLAN §3.2, §5.3). Also the body of `npm run content:validate`.
 */
import { describe, expect, it } from 'vitest';
import { LANDMARKS, findLandmark } from '../../src/content/landmarks';
import { Fact, Landmark, idFromPath, parseLandmarkFiles } from '../../src/content/schema';
import { formatFact, hasFactLabel } from '../../src/content/facts';
import { hasModel } from '../../src/models/index';

/** The starter list from PLAN §5.3, in table order. */
const PLAN_LANDMARKS: ReadonlyArray<readonly [string, number, number]> = [
  ['eiffel-tower', 48.8584, 2.2945],
  ['statue-of-liberty', 40.6892, -74.0445],
  ['great-pyramid-giza', 29.9792, 31.1342],
  ['taj-mahal', 27.1751, 78.0421],
  ['great-wall-mutianyu', 40.4319, 116.5704],
  ['mount-fuji', 35.3606, 138.7274],
  ['sydney-opera-house', -33.8568, 151.2153],
  ['christ-the-redeemer', -22.9519, -43.2105],
  ['big-ben', 51.5007, -0.1246],
  ['colosseum', 41.8902, 12.4922],
  ['machu-picchu', -13.1631, -72.545],
  ['petra-treasury', 30.3222, 35.4519],
  ['angkor-wat', 13.4125, 103.867],
  ['burj-khalifa', 25.1972, 55.2744],
  ['golden-gate-bridge', 37.8199, -122.4783],
  ['moai-rapa-nui', -27.1258, -109.277],
  ['india-gate', 28.6129, 77.2295],
  ['stonehenge', 51.1789, -1.8262],
  ['kilimanjaro', -3.0674, 37.3556],
  ['gyeongbokgung', 37.5796, 126.977],
];

/** A valid landmark to mutate in the negative tests. */
const sample = () => structuredClone(findLandmark('eiffel-tower')!) as Record<string, unknown>;

describe('landmark content', () => {
  it('loads exactly the 20 PLAN landmarks, sorted by id, at the PLAN positions', () => {
    const want = PLAN_LANDMARKS.map(([id]) => id).sort();
    expect(LANDMARKS.map((lm) => lm.id)).toEqual(want);
    for (const [id, lat, lng] of PLAN_LANDMARKS) {
      expect(findLandmark(id)?.pos, id).toEqual({ lat, lng });
    }
  });

  it('every file passes the schema on its own', () => {
    for (const lm of LANDMARKS) expect(Landmark.safeParse(lm).success, lm.id).toBe(true);
  });

  it('has 1–3 sourced facts per landmark, each with a hand-written label', () => {
    for (const lm of LANDMARKS) {
      expect(lm.facts.length, lm.id).toBeGreaterThanOrEqual(1);
      expect(lm.facts.length, lm.id).toBeLessThanOrEqual(3);
      for (const f of lm.facts) {
        expect(f.source, `${lm.id}.${f.key}`).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
        expect(hasFactLabel(f.key), `${lm.id}.${f.key}`).toBe(true);
      }
    }
  });

  it('uses the expected country codes', () => {
    const country = (id: string) => findLandmark(id)?.country;
    expect(country('moai-rapa-nui')).toBe('CL');
    expect(country('petra-treasury')).toBe('JO');
    expect(country('machu-picchu')).toBe('PE');
    expect(country('gyeongbokgung')).toBe('KR');
    expect(country('great-wall-mutianyu')).toBe('CN');
    expect(country('big-ben')).toBe('GB');
  });

  it('keeps blurbs short (at most two sentences)', () => {
    for (const lm of LANDMARKS) {
      const sentences = lm.blurb.en.split(/[.!?](?:\s|$)/).filter((s) => s.trim());
      expect(sentences.length, lm.id).toBeLessThanOrEqual(2);
    }
  });

  it('finds landmarks by id and ignores unknown or empty ids', () => {
    expect(findLandmark('big-ben')?.name.en).toBe('Big Ben');
    expect(findLandmark('atlantis')).toBeUndefined();
    expect(findLandmark(null)).toBeUndefined();
    expect(findLandmark('')).toBeUndefined();
  });

  it('names only registered model builders, and the 10 starters have one each', () => {
    for (const lm of LANDMARKS) {
      if (lm.model !== undefined) expect(hasModel(lm.model), `${lm.id}: ${lm.model}`).toBe(true);
    }
    for (const [id] of PLAN_LANDMARKS.slice(0, 10)) {
      expect(findLandmark(id)?.model, id).toBe(`landmarks/${id}`);
    }
    expect(hasModel('landmarks/atlantis')).toBe(false);
  });
});

describe('landmark schema', () => {
  it('rejects out-of-range latitude and longitude', () => {
    for (const pos of [
      { lat: 91, lng: 0 },
      { lat: -90.5, lng: 0 },
      { lat: 0, lng: 180.1 },
      { lat: 0, lng: -181 },
    ]) {
      expect(Landmark.safeParse({ ...sample(), pos }).success, JSON.stringify(pos)).toBe(false);
    }
  });

  it('rejects facts without an http(s) source', () => {
    expect(Fact.safeParse({ key: 'height_m', value: 330 }).success).toBe(false);
    expect(Fact.safeParse({ key: 'height_m', value: 330, source: '' }).success).toBe(false);
    expect(Fact.safeParse({ key: 'height_m', value: 330, source: 'wikipedia' }).success).toBe(
      false,
    );
    expect(
      Fact.safeParse({ key: 'height_m', value: 330, source: 'ftp://example.org/x' }).success,
    ).toBe(false);
    expect(
      Fact.safeParse({ key: 'height_m', value: 330, source: 'https://example.org/x' }).success,
    ).toBe(true);
    const lm = sample();
    lm.facts = [{ key: 'built', value: '1889' }];
    expect(Landmark.safeParse(lm).success).toBe(false);
  });

  it('rejects non-kebab-case ids, bad country codes, unknown fields and missing English', () => {
    expect(Landmark.safeParse({ ...sample(), id: 'Eiffel_Tower' }).success).toBe(false);
    expect(Landmark.safeParse({ ...sample(), country: 'fr' }).success).toBe(false);
    expect(Landmark.safeParse({ ...sample(), country: 'FRA' }).success).toBe(false);
    expect(Landmark.safeParse({ ...sample(), colour: 'red' }).success).toBe(false);
    expect(Landmark.safeParse({ ...sample(), name: { fr: 'Tour Eiffel' } }).success).toBe(false);
    expect(Landmark.safeParse({ ...sample(), facts: [] }).success).toBe(false);
  });

  it('accepts the optional model, scale, photo and minZoom fields', () => {
    const lm = {
      ...sample(),
      model: 'landmarks/eiffel',
      scale: 1,
      minZoom: 2,
      photo: {
        file: 'photos/eiffel-tower.webp',
        credit: {
          url: 'https://commons.wikimedia.org/wiki/File:X.jpg',
          author: 'A',
          license: 'CC0',
        },
      },
    };
    expect(Landmark.safeParse(lm).success).toBe(true);
  });
});

describe('parseLandmarkFiles', () => {
  it('takes the id from the file name', () => {
    expect(idFromPath('/content/landmarks/big-ben.json')).toBe('big-ben');
    expect(idFromPath('big-ben.json')).toBe('big-ben');
  });

  it('returns the landmarks sorted by id', () => {
    const a = { ...sample(), id: 'b-thing' };
    const b = { ...sample(), id: 'a-thing' };
    const out = parseLandmarkFiles({ '/x/b-thing.json': a, '/x/a-thing.json': b });
    expect(out.map((lm) => lm.id)).toEqual(['a-thing', 'b-thing']);
  });

  it('rejects an id that does not match its file name', () => {
    expect(() => parseLandmarkFiles({ '/x/big-ben.json': sample() })).toThrow(
      /does not match file name/,
    );
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      parseLandmarkFiles({
        '/a/eiffel-tower.json': sample(),
        '/b/eiffel-tower.json': sample(),
      }),
    ).toThrow(/duplicate id "eiffel-tower"/);
  });

  it('lists every schema problem with its file and field', () => {
    const bad = { ...sample(), pos: { lat: 100, lng: 0 } };
    expect(() => parseLandmarkFiles({ '/x/eiffel-tower.json': bad })).toThrow(
      /eiffel-tower\.json: pos\.lat/,
    );
  });
});

describe('formatFact', () => {
  it('labels known keys and appends units', () => {
    expect(formatFact({ key: 'height_m', value: 330 })).toEqual({
      label: 'Height',
      value: '330 m',
    });
    expect(formatFact({ key: 'elevation_m', value: 5895 })).toEqual({
      label: 'Height above the sea',
      value: '5,895 m',
    });
    expect(formatFact({ key: 'total_length_km', value: 21196 })).toEqual({
      label: 'Whole length',
      value: '21,196 km',
    });
    expect(formatFact({ key: 'great_wall_length_km', value: 21196 })).toEqual({
      label: 'Whole Great Wall',
      value: '21,196 km',
    });
    expect(formatFact({ key: 'built', value: '1887–1889' })).toEqual({
      label: 'Built',
      value: '1887–1889',
    });
  });

  it('never adds separators to unitless numbers such as years', () => {
    expect(formatFact({ key: 'built', value: 1395 })).toEqual({ label: 'Built', value: '1395' });
  });

  it('falls back to a readable label for unknown keys', () => {
    expect(formatFact({ key: 'floor_count', value: 163 })).toEqual({
      label: 'Floor count',
      value: '163',
    });
    expect(formatFact({ key: 'width_m', value: 12 }).label).toBe('Width');
  });
});
