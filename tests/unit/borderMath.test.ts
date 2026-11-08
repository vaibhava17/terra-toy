import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { llToVec3 } from '../../src/engine/geo';
import {
  BORDER_LOD_IN,
  BORDER_LOD_OUT,
  BORDER_RADIUS,
  BORDER_WIDTH_FAR,
  BORDER_WIDTH_NEAR,
  MAX_SEGMENT_DEG,
  borderWidthForDistance,
  buildLinePositions,
  nextBorderLevel,
  type BorderLevel,
} from '../../src/engine/globe/borderMath';
import { loadCountrySet } from '../../src/engine/globe/countries';
import { MAX_DISTANCE, MIN_DISTANCE } from '../../src/engine/rigMath';

const RAD2DEG = 180 / Math.PI;

/** Unpacks segment pairs from a positions array. */
function segments(pos: Float32Array): Array<[Vector3, Vector3]> {
  const out: Array<[Vector3, Vector3]> = [];
  for (let i = 0; i < pos.length; i += 6) {
    out.push([
      new Vector3(pos[i], pos[i + 1], pos[i + 2]),
      new Vector3(pos[i + 3], pos[i + 4], pos[i + 5]),
    ]);
  }
  return out;
}

/** Asserts the invariants every border geometry must satisfy (one expect per check: fast). */
function expectWellFormed(pos: Float32Array, radius: number, maxDeg: number): void {
  expect(pos.length % 6).toBe(0);
  let nonFinite = 0;
  let offRadius = 0;
  let maxArc = 0;
  for (const v of pos) if (!Number.isFinite(v)) nonFinite++;
  for (const [a, b] of segments(pos)) {
    if (Math.abs(a.length() - radius) > 1e-5 || Math.abs(b.length() - radius) > 1e-5) offRadius++;
    maxArc = Math.max(maxArc, a.angleTo(b) * RAD2DEG);
  }
  expect(nonFinite).toBe(0);
  expect(offRadius).toBe(0);
  expect(maxArc).toBeLessThanOrEqual(maxDeg + 1e-4);
}

describe('buildLinePositions', () => {
  it('returns an empty array for no lines, single points and zero-length edges', () => {
    expect(buildLinePositions([])).toHaveLength(0);
    expect(buildLinePositions([[[10, 20]]])).toHaveLength(0);
    expect(
      buildLinePositions([
        [
          [10, 20],
          [10, 20],
        ],
      ]),
    ).toHaveLength(0);
  });

  it('keeps short edges as one segment with exact endpoints on the sphere', () => {
    const pos = buildLinePositions([
      [
        [2, 48],
        [2.5, 48.2],
      ],
    ]);
    expect(pos).toHaveLength(6);
    const [[a, b]] = segments(pos) as [[Vector3, Vector3]];
    expect(a.distanceTo(llToVec3(48, 2, BORDER_RADIUS))).toBeLessThan(1e-6);
    expect(b.distanceTo(llToVec3(48.2, 2.5, BORDER_RADIUS))).toBeLessThan(1e-6);
  });

  it('densifies a long straight map edge (the 49th parallel) along the great circle', () => {
    const pos = buildLinePositions([
      [
        [-123, 49],
        [-95, 49],
      ],
    ]);
    expectWellFormed(pos, BORDER_RADIUS, MAX_SEGMENT_DEG);
    const segs = segments(pos);
    expect(segs.length).toBeGreaterThan(15);
    // Consecutive: each segment starts where the previous one ended.
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]![0].distanceTo(segs[i - 1]![1])).toBeLessThan(1e-6);
    }
    // The midpoint of every segment is barely below the sphere (no cutting through it).
    for (const [a, b] of segs) {
      expect(a.clone().add(b).multiplyScalar(0.5).length()).toBeGreaterThan(BORDER_RADIUS - 1e-4);
    }
  });

  it('respects radius and maxSegmentDeg options', () => {
    const pos = buildLinePositions(
      [
        [
          [0, 0],
          [30, 10],
          [60, -5],
        ],
      ],
      { radius: 1.5, maxSegmentDeg: 0.25 },
    );
    expectWellFormed(pos, 1.5, 0.25);
  });

  it('crosses the antimeridian the short way instead of wrapping round the globe', () => {
    const pos = buildLinePositions([
      [
        [179, 10],
        [-179, 10],
      ],
    ]);
    expectWellFormed(pos, BORDER_RADIUS, MAX_SEGMENT_DEG);
    const segs = segments(pos);
    expect(segs.length).toBe(2); // ≈1.97° of arc, not ≈354°
    for (const [a] of segs) expect(a.x).toBeLessThan(0); // stays on the 180° side (x < 0)
  });

  it('drops edges lying along the ±180° cut (flat-map artefacts)', () => {
    expect(
      buildLinePositions([
        [
          [180, -90],
          [180, -80],
          [-180, -70],
        ],
      ]),
    ).toHaveLength(0);
  });

  it('skips undefined antipodal edges and polar duplicates without producing NaN', () => {
    const pos = buildLinePositions([
      [
        [0, 0],
        [180, 0],
        [-90, -90],
        [90, -90],
        [10, 0],
      ],
    ]);
    expect(pos.length % 6).toBe(0);
    for (const v of pos) expect(Number.isFinite(v)).toBe(true);
  });

  it.each<BorderLevel>(['110m', '50m'])(
    'builds the real %s border mesh: finite, on the radius, short segments, no ±180° seam',
    async (level) => {
      const set = await loadCountrySet(level);
      const pos = buildLinePositions(set.borders.coordinates);
      expect(pos.length).toBeGreaterThan(6 * 500);
      expectWellFormed(pos, BORDER_RADIUS, MAX_SEGMENT_DEG);
    },
  );
});

describe('nextBorderLevel', () => {
  it('switches to 50m only below the zoom-in threshold', () => {
    expect(nextBorderLevel(MAX_DISTANCE, '110m')).toBe('110m');
    expect(nextBorderLevel(BORDER_LOD_IN + 0.01, '110m')).toBe('110m');
    expect(nextBorderLevel(BORDER_LOD_IN - 0.01, '110m')).toBe('50m');
    expect(nextBorderLevel(MIN_DISTANCE, '110m')).toBe('50m');
  });

  it('switches back to 110m only above the zoom-out threshold', () => {
    expect(nextBorderLevel(MIN_DISTANCE, '50m')).toBe('50m');
    expect(nextBorderLevel(BORDER_LOD_OUT - 0.01, '50m')).toBe('50m');
    expect(nextBorderLevel(BORDER_LOD_OUT + 0.01, '50m')).toBe('110m');
  });

  it('has a hysteresis band where both levels are stable (no flicker)', () => {
    expect(BORDER_LOD_OUT).toBeGreaterThan(BORDER_LOD_IN);
    const mid = (BORDER_LOD_IN + BORDER_LOD_OUT) / 2;
    expect(nextBorderLevel(mid, '110m')).toBe('110m');
    expect(nextBorderLevel(mid, '50m')).toBe('50m');
    // Jittering around either threshold by less than the band never toggles twice.
    let level: BorderLevel = '110m';
    let switches = 0;
    for (let i = 0; i < 200; i++) {
      const d = BORDER_LOD_IN + (i % 2 === 0 ? -0.05 : 0.05);
      const next = nextBorderLevel(d, level);
      if (next !== level) switches++;
      level = next;
    }
    expect(switches).toBe(1);
  });

  it('keeps the current level for non-finite distances', () => {
    expect(nextBorderLevel(NaN, '50m')).toBe('50m');
    expect(nextBorderLevel(Infinity, '110m')).toBe('110m');
  });
});

describe('borderWidthForDistance', () => {
  it('goes from the far width to the near width and is monotonic', () => {
    expect(borderWidthForDistance(MAX_DISTANCE)).toBeCloseTo(BORDER_WIDTH_FAR, 6);
    expect(borderWidthForDistance(MIN_DISTANCE)).toBeCloseTo(BORDER_WIDTH_NEAR, 6);
    expect(borderWidthForDistance(100)).toBeCloseTo(BORDER_WIDTH_FAR, 6);
    expect(borderWidthForDistance(0)).toBeCloseTo(BORDER_WIDTH_NEAR, 6);
    expect(borderWidthForDistance(NaN)).toBeCloseTo(BORDER_WIDTH_FAR, 6);
    let prev = Infinity;
    for (let d = MIN_DISTANCE; d <= MAX_DISTANCE; d += 0.05) {
      const w = borderWidthForDistance(d);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });
});
