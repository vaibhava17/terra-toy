/**
 * Pure geographic math on a unit sphere (R = 1). Uses three's math classes
 * only — no scene, renderer, or DOM. See docs/PLAN.md §3.3.
 *
 * Convention (matches three's `SphereGeometry` UVs):
 *   x = −cos φ · cos(λ + 180°)  ( = cos φ · cos λ )
 *   y =  sin φ
 *   z =  cos φ · sin(λ + 180°)  ( = −cos φ · sin λ )
 * where φ = latitude, λ = longitude. So lat 0 / lng 0 is +X, the north pole
 * is +Y, and lng +90° (east) is −Z.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';

export interface LatLng {
  /** Latitude in degrees, −90 … 90. */
  lat: number;
  /** Longitude in degrees, −180 … 180. */
  lng: number;
}

/** Mean Earth radius (IUGG), km. */
export const EARTH_RADIUS_KM = 6371.0088;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Below this angle (radians) two unit vectors are treated as identical. */
const IDENTICAL_EPS = 1e-12;
/** Within this angle (radians) of π two unit vectors are treated as antipodal. */
const ANTIPODAL_EPS = 1e-9;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Normalise a longitude in degrees to [−180, 180). Collapses −0 to 0. */
export function normalizeLng(lng: number): number {
  const n = ((((lng + 180) % 360) + 360) % 360) - 180;
  return n === 0 ? 0 : n;
}

/** Lat/lng (degrees) → point on a sphere of radius `r`. Writes into `target` if given. */
export function llToVec3(lat: number, lng: number, r = 1, target = new Vector3()): Vector3 {
  const phi = lat * DEG2RAD;
  const lam = lng * DEG2RAD;
  const c = Math.cos(phi);
  return target.set(r * c * Math.cos(lam), r * Math.sin(phi), -r * c * Math.sin(lam));
}

/** Point (any non-zero length) → lat/lng in degrees, lng in [−180, 180). */
export function vec3ToLl(v: Vector3): LatLng {
  const len = v.length();
  if (len === 0) return { lat: 0, lng: 0 };
  const lat = Math.asin(clamp(v.y / len, -1, 1)) * RAD2DEG;
  // At the poles x = z = 0; atan2(0, 0) = 0, so lng falls back to 0.
  const lng = normalizeLng(Math.atan2(-v.z, v.x) * RAD2DEG);
  return { lat, lng };
}

const _ca = new Vector3();
const _cb = new Vector3();

/**
 * Central angle between two points, radians. Uses atan2(|a×b|, a·b), which is
 * well-conditioned for tiny, medium and near-antipodal separations alike
 * (the classic haversine form loses ~1e-8 rad of precision near π).
 */
export function centralAngle(a: LatLng, b: LatLng): number {
  llToVec3(a.lat, a.lng, 1, _ca);
  llToVec3(b.lat, b.lng, 1, _cb);
  const dot = _ca.dot(_cb);
  const cross = _ca.cross(_cb).length();
  return Math.atan2(cross, dot);
}

/** Great-circle distance in km (equivalent to the haversine formula, computed via `centralAngle`). */
export function haversineKm(a: LatLng, b: LatLng, radiusKm = EARTH_RADIUS_KM): number {
  return centralAngle(a, b) * radiusKm;
}

const _va = new Vector3();
const _vb = new Vector3();
const _vo = new Vector3();
const _axis = new Vector3();
const _q = new Quaternion();
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

/**
 * Point at fraction `t` (0…1) along the shorter great circle from `a` to `b`.
 * - identical points → `a`
 * - antipodal points (infinitely many great circles) → deterministic path:
 *   rotate `a` about `normalize(a × Y)` (or `a × X` if `a` is at a pole),
 *   i.e. the path runs along a meridian through the north pole.
 * Endpoints are returned exactly for t = 0 and t = 1.
 */
export function greatCircleInterpolate(a: LatLng, b: LatLng, t: number): LatLng {
  if (t <= 0) return { lat: a.lat, lng: a.lng };
  if (t >= 1) return { lat: b.lat, lng: b.lng };
  llToVec3(a.lat, a.lng, 1, _va);
  llToVec3(b.lat, b.lng, 1, _vb);
  const omega = Math.acos(clamp(_va.dot(_vb), -1, 1));

  if (omega < IDENTICAL_EPS) return { lat: a.lat, lng: a.lng };

  if (Math.PI - omega < ANTIPODAL_EPS) {
    _axis.crossVectors(_va, AXIS_Y);
    if (_axis.lengthSq() < 1e-12) _axis.crossVectors(_va, AXIS_X);
    _axis.normalize();
    _q.setFromAxisAngle(_axis, t * Math.PI);
    return vec3ToLl(_vo.copy(_va).applyQuaternion(_q));
  }

  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s;
  const wb = Math.sin(t * omega) / s;
  _vo.copy(_va).multiplyScalar(wa).addScaledVector(_vb, wb).normalize();
  return vec3ToLl(_vo);
}

/** `n + 1` points along the great circle from `a` to `b` (inclusive). `n` ≥ 1. */
export function greatCirclePoints(a: LatLng, b: LatLng, n: number): LatLng[] {
  const segs = Math.max(1, Math.floor(n));
  const out: LatLng[] = [];
  for (let i = 0; i <= segs; i++) out.push(greatCircleInterpolate(a, b, i / segs));
  return out;
}

const _up = new Vector3();
const _north = new Vector3();
const _east = new Vector3();
const _back = new Vector3();
const _m = new Matrix4();

/**
 * Orientation for an object standing on the surface at (lat, lng):
 * local +Y → surface normal (up), local −Z → north (front), local +X → east.
 * This matches the model-kit convention in PLAN §5.1.
 *
 * North is the analytic tangent ∂P/∂φ, which stays finite at the poles: there it
 * points along the meridian of `lng` (at the north pole, "north" continues over
 * the pole toward lng + 180°). If that tangent degenerates numerically, a fixed
 * reference axis (+X, then +Z) projected onto the tangent plane is used instead.
 */
export function surfaceFrame(lat: number, lng: number, target = new Quaternion()): Quaternion {
  const phi = clamp(lat, -90, 90) * DEG2RAD;
  const lam = lng * DEG2RAD;
  llToVec3(clamp(lat, -90, 90), lng, 1, _up);
  // ∂/∂φ of (cosφ cosλ, sinφ, −cosφ sinλ)
  _north.set(-Math.sin(phi) * Math.cos(lam), Math.cos(phi), Math.sin(phi) * Math.sin(lam));
  // Orthogonalise against up and normalise (guards against rounding).
  _north.addScaledVector(_up, -_north.dot(_up));
  if (_north.lengthSq() < 1e-12) {
    _north.copy(AXIS_X).addScaledVector(_up, -AXIS_X.dot(_up));
    if (_north.lengthSq() < 1e-12) _north.set(0, 0, 1).addScaledVector(_up, -_up.z);
  }
  _north.normalize();
  _east.crossVectors(_north, _up).normalize(); // X = Y × Z = up × (−north) = north × up
  _back.copy(_north).negate(); // local +Z = south
  _m.makeBasis(_east, _up, _back);
  return target.setFromRotationMatrix(_m);
}
