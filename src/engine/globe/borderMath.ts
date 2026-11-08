/**
 * Pure math for the border line layer (no scene, renderer or DOM), unit-tested in
 * tests/unit/borderMath.test.ts:
 *  - turning lon/lat polylines into `LineSegments2` positions that hug the sphere,
 *  - the 110m ↔ 50m level-of-detail switch (with hysteresis),
 *  - the zoom-dependent line width.
 */
import { MAX_DISTANCE, MIN_DISTANCE, clamp } from '../rigMath';

/** A GeoJSON position: [longitude, latitude] in degrees (extra values ignored). */
export type LonLat = readonly number[];

/** Radius the border lines float at: just above the surface so they don't z-fight it. */
export const BORDER_RADIUS = 1.0015;
/** Highlight outlines float a hair higher so they win over the plain borders. */
export const HIGHLIGHT_RADIUS = 1.0025;
/** Longest allowed segment, degrees of arc. Longer ones are split along the great circle. */
export const MAX_SEGMENT_DEG = 1;

/**
 * Longitudes at or beyond this are on the antimeridian cut. Natural Earth splits
 * countries there (Russia, Fiji, Antarctica); an edge running *along* the cut is an
 * artefact of the flat map, not a real border, so it is dropped.
 */
const ANTIMERIDIAN_LNG = 180 - 1e-6;
/** Below this angle (radians) two points are the same point (e.g. polar ring vertices). */
const SAME_POINT_RAD = 1e-9;
/** Within this angle (radians) of π the great circle is undefined; the edge is skipped. */
const ANTIPODAL_RAD = 1e-6;

const DEG2RAD = Math.PI / 180;

export interface LinePositionOptions {
  /** Sphere radius for every output point. Default BORDER_RADIUS. */
  radius?: number;
  /** Maximum arc per output segment, degrees. Default MAX_SEGMENT_DEG. */
  maxSegmentDeg?: number;
}

/** Writes the unit vector for [lng, lat] into out[0..2] (same convention as `geo.llToVec3`). */
function unit(p: LonLat, out: Float64Array): void {
  const lam = (p[0] ?? 0) * DEG2RAD;
  const phi = (p[1] ?? 0) * DEG2RAD;
  const c = Math.cos(phi);
  out[0] = c * Math.cos(lam);
  out[1] = Math.sin(phi);
  out[2] = -c * Math.sin(lam);
}

const onCut = (a: LonLat, b: LonLat): boolean =>
  Math.abs(a[0] ?? 0) >= ANTIMERIDIAN_LNG && Math.abs(b[0] ?? 0) >= ANTIMERIDIAN_LNG;

const _a = new Float64Array(3);
const _b = new Float64Array(3);

/** Central angle between the unit vectors in _a and _b (atan2 form: stable everywhere). */
function angleAB(): number {
  const cx = _a[1]! * _b[2]! - _a[2]! * _b[1]!;
  const cy = _a[2]! * _b[0]! - _a[0]! * _b[2]!;
  const cz = _a[0]! * _b[1]! - _a[1]! * _b[0]!;
  const dot = _a[0]! * _b[0]! + _a[1]! * _b[1]! + _a[2]! * _b[2]!;
  return Math.atan2(Math.hypot(cx, cy, cz), dot);
}

/** Number of output segments for the edge a→b, or 0 if the edge is skipped. */
function edgeSegments(a: LonLat, b: LonLat, maxRad: number): number {
  if (onCut(a, b)) return 0;
  unit(a, _a);
  unit(b, _b);
  const omega = angleAB();
  if (!(omega > SAME_POINT_RAD) || omega > Math.PI - ANTIPODAL_RAD) return 0;
  return Math.max(1, Math.ceil(omega / maxRad));
}

/**
 * Lon/lat polylines (e.g. a GeoJSON MultiLineString's coordinates) → flat positions for
 * `LineSegmentsGeometry.setPositions`: [x1, y1, z1, x2, y2, z2, …], one pair per segment.
 *
 * Every edge follows the shorter great circle between its endpoints (slerp), split so no
 * segment spans more than `maxSegmentDeg`: straight map lines such as the 49th parallel
 * stay on the sphere instead of cutting through it. Because the interpolation is in 3D,
 * an edge from 179.9° to −179.9° is a short hop across the antimeridian, never a line
 * wrapping round the globe. Edges lying along the ±180° cut, zero-length edges and
 * (undefined) antipodal edges are skipped. Every output point lies at exactly `radius`.
 */
export function buildLinePositions(
  lines: ReadonlyArray<ReadonlyArray<LonLat>>,
  { radius = BORDER_RADIUS, maxSegmentDeg = MAX_SEGMENT_DEG }: LinePositionOptions = {},
): Float32Array {
  const maxRad = Math.max(1e-3, maxSegmentDeg) * DEG2RAD;

  // Pass 1: count, so the output is allocated once.
  let count = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) count += edgeSegments(line[i - 1]!, line[i]!, maxRad);
  }

  const out = new Float32Array(count * 6);
  let o = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const n = edgeSegments(line[i - 1]!, line[i]!, maxRad); // also fills _a, _b
      if (n === 0) continue;
      const omega = angleAB();
      const s = Math.sin(omega);
      let px = _a[0]! * radius;
      let py = _a[1]! * radius;
      let pz = _a[2]! * radius;
      for (let k = 1; k <= n; k++) {
        let qx: number, qy: number, qz: number;
        if (k === n) {
          qx = _b[0]!;
          qy = _b[1]!;
          qz = _b[2]!;
        } else {
          const t = k / n;
          const wa = Math.sin((1 - t) * omega) / s;
          const wb = Math.sin(t * omega) / s;
          qx = wa * _a[0]! + wb * _b[0]!;
          qy = wa * _a[1]! + wb * _b[1]!;
          qz = wa * _a[2]! + wb * _b[2]!;
          const len = Math.hypot(qx, qy, qz); // ≈1; renormalise against rounding
          qx /= len;
          qy /= len;
          qz /= len;
        }
        qx *= radius;
        qy *= radius;
        qz *= radius;
        out[o++] = px;
        out[o++] = py;
        out[o++] = pz;
        out[o++] = qx;
        out[o++] = qy;
        out[o++] = qz;
        px = qx;
        py = qy;
        pz = qz;
      }
    }
  }
  return out;
}

// ---- Level of detail ------------------------------------------------------------------

export type BorderLevel = '110m' | '50m';

/** Zooming in past this camera distance switches to the detailed 50m borders… */
export const BORDER_LOD_IN = 2.0;
/** …and zooming back out past this one returns to 110m. The gap is the hysteresis. */
export const BORDER_LOD_OUT = 2.3;

/**
 * The border level to show at `distance`, given the level shown now. Inside the
 * hysteresis band (BORDER_LOD_IN … BORDER_LOD_OUT) the current level is kept, so a
 * camera resting on the threshold doesn't flicker between the two sets.
 */
export function nextBorderLevel(distance: number, current: BorderLevel): BorderLevel {
  if (!Number.isFinite(distance)) return current;
  if (current === '110m') return distance < BORDER_LOD_IN ? '50m' : '110m';
  return distance > BORDER_LOD_OUT ? '110m' : '50m';
}

/** Border width in CSS px at MAX_DISTANCE (zoomed out) and MIN_DISTANCE (zoomed in). */
export const BORDER_WIDTH_FAR = 1.1;
export const BORDER_WIDTH_NEAR = 2;

/** Border width (CSS px): grows gently as the camera zooms in. Monotonic in distance. */
export function borderWidthForDistance(distance: number): number {
  const d = Number.isFinite(distance) ? distance : MAX_DISTANCE;
  const t = clamp((MAX_DISTANCE - d) / (MAX_DISTANCE - MIN_DISTANCE), 0, 1);
  return BORDER_WIDTH_FAR + (BORDER_WIDTH_NEAR - BORDER_WIDTH_FAR) * t;
}
