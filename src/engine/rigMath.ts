/**
 * Pure camera math for the GlobeRig: no scene, renderer or DOM. Every curve the
 * rig uses lives here so it can be unit-tested (tests/unit/rigMath.test.ts).
 *
 * Globe radius is 1. "Distance" is the camera's distance from the globe centre.
 */
import { Quaternion, Vector3 } from 'three';
import { llToVec3, vec3ToLl } from './geo';
import type { GlobeViewState } from './view';

export const MIN_DISTANCE = 1.25;
export const MAX_DISTANCE = 4.5;
/** The camera never goes closer than this to a pole (keeps OrbitControls' up vector sane). */
export const MAX_CAMERA_LAT = 80;
/** Vertical field of view, degrees. */
export const CAMERA_FOV = 45;

/** Below this distance the view starts tilting toward the horizon. */
export const TILT_START_DISTANCE = 2.4;
/** Tilt at MIN_DISTANCE, degrees. */
export const MAX_TILT_DEG = 32;

export const ZOOM_IN_FACTOR = 0.7;
export const ZOOM_OUT_FACTOR = 1.4;

const DEG2RAD = Math.PI / 180;

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Cubic Hermite 0→1 with zero slope at both ends. */
export const smoothstep01 = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Ease-in-out cubic, t ∈ [0, 1] (clamped). */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function clampDistance(d: number): number {
  if (!Number.isFinite(d)) return MAX_DISTANCE;
  return clamp(d, MIN_DISTANCE, MAX_DISTANCE);
}

/**
 * Extra camera pitch (radians, positive = look up toward the horizon) for a distance.
 * 0 from TILT_START_DISTANCE outward, easing up to MAX_TILT_DEG at MIN_DISTANCE.
 * Monotonically non-increasing in distance.
 */
export function tiltForDistance(distance: number): number {
  const x = (TILT_START_DISTANCE - distance) / (TILT_START_DISTANCE - MIN_DISTANCE);
  return MAX_TILT_DEG * DEG2RAD * smoothstep01(x);
}

export const MIN_ROTATE_SPEED = 0.03;
export const MAX_ROTATE_SPEED = 1;

/**
 * OrbitControls `rotateSpeed` so the ground under the finger feels grabbed.
 * OrbitControls turns 2π·rotateSpeed per screen height; one screen height spans
 * about (distance − 1)·fov of surface arc at the centre of the view, so
 * rotateSpeed ≈ (distance − 1)·fov / 2π. Monotonically non-decreasing in distance.
 */
export function rotateSpeedForDistance(distance: number, fovDeg = CAMERA_FOV): number {
  const altitude = Math.max(0, distance - 1);
  return clamp((altitude * fovDeg * DEG2RAD) / (2 * Math.PI), MIN_ROTATE_SPEED, MAX_ROTATE_SPEED);
}

/** Target distance after one zoom-button step, clamped to the allowed range. */
export function zoomStep(distance: number, direction: 'in' | 'out'): number {
  return clampDistance(distance * (direction === 'in' ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR));
}

/** Camera position for a view: the point above (lat, lng) at `distance` from the centre. */
export function cameraPosition(
  lat: number,
  lng: number,
  distance: number,
  target = new Vector3(),
): Vector3 {
  return llToVec3(lat, lng, distance, target);
}

/** View (lat/lng under the camera, distance) for a camera position. */
export function viewFromPosition(position: Vector3): GlobeViewState {
  const { lat, lng } = vec3ToLl(position);
  return { lat, lng, distance: position.length() };
}

/** A precomputed flight; sampling it allocates nothing. */
export interface FlightPlan {
  /** Unit start direction. */
  readonly from: Vector3;
  /** Unit rotation axis of the great circle (from → to). */
  readonly axis: Vector3;
  /** Total central angle, radians (0 … π). */
  angle: number;
  fromDistance: number;
  toDistance: number;
  /** Extra height at mid-flight so long hops "lift off" and show more of the globe. */
  hop: number;
  durationMs: number;
}

export function createFlightPlan(): FlightPlan {
  return {
    from: new Vector3(1, 0, 0),
    axis: new Vector3(0, 1, 0),
    angle: 0,
    fromDistance: MIN_DISTANCE,
    toDistance: MIN_DISTANCE,
    hop: 0,
    durationMs: 0,
  };
}

/** Peak extra distance for a half-globe flight. */
export const FLIGHT_HOP_GAIN = 1.2;

/** Default flight duration (ms): longer for longer arcs and bigger zoom changes. */
export function flightDuration(angle: number, fromDistance: number, toDistance: number): number {
  const zoomChange = Math.abs(Math.log(Math.max(toDistance, 1e-6) / Math.max(fromDistance, 1e-6)));
  return clamp(700 + (angle / Math.PI) * 1800 + zoomChange * 500, 350, 3000);
}

const _to = new Vector3();
const _axisFallback = new Vector3();
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

/**
 * Plans a flight from the current camera position to (lat, lng, distance).
 * The target latitude is clamped to ±MAX_CAMERA_LAT and the distance to the zoom range.
 * The path follows the shorter great circle (so 170° → −170° crosses the antimeridian).
 * Antipodal targets use the same deterministic fallback axis as geo.greatCircleInterpolate.
 * Writes into `plan` (no allocation).
 */
export function planFlight(
  fromPosition: Vector3,
  lat: number,
  lng: number,
  distance: number,
  durationMs: number | undefined,
  plan: FlightPlan,
): FlightPlan {
  const fromDistance = clampDistance(fromPosition.length() || MIN_DISTANCE);
  const toDistance = clampDistance(distance);
  if (fromPosition.lengthSq() > 0) plan.from.copy(fromPosition).normalize();
  else plan.from.set(1, 0, 0);
  llToVec3(clamp(lat, -MAX_CAMERA_LAT, MAX_CAMERA_LAT), lng, 1, _to);

  const dot = clamp(plan.from.dot(_to), -1, 1);
  plan.axis.crossVectors(plan.from, _to);
  const sin = plan.axis.length();
  plan.angle = Math.atan2(sin, dot);
  if (sin > 1e-9) {
    plan.axis.divideScalar(sin);
  } else if (dot > 0) {
    // Same point: no rotation needed; any axis works.
    plan.axis.copy(AXIS_Y);
    plan.angle = 0;
  } else {
    // Antipodal: rotate about normalize(from × Y), or from × X at a pole.
    _axisFallback.crossVectors(plan.from, AXIS_Y);
    if (_axisFallback.lengthSq() < 1e-12) _axisFallback.crossVectors(plan.from, AXIS_X);
    plan.axis.copy(_axisFallback.normalize());
    plan.angle = Math.PI;
  }

  plan.fromDistance = fromDistance;
  plan.toDistance = toDistance;
  plan.hop = FLIGHT_HOP_GAIN * (plan.angle / Math.PI);
  plan.durationMs =
    durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0
      ? durationMs
      : flightDuration(plan.angle, fromDistance, toDistance);
  return plan;
}

/** Eased distance at flight progress t ∈ [0, 1] (with mid-flight hop), clamped to the zoom range. */
export function flightDistance(plan: FlightPlan, t: number): number {
  const e = easeInOutCubic(t);
  const d = plan.fromDistance + (plan.toDistance - plan.fromDistance) * e;
  return clampDistance(d + plan.hop * Math.sin(Math.PI * e));
}

const _q = new Quaternion();

/**
 * Camera position at flight progress t ∈ [0, 1] (time fraction; easing applied here).
 * Writes into `out`; allocates nothing. t = 0 → start position, t = 1 → exact target.
 */
export function sampleFlight(plan: FlightPlan, t: number, out: Vector3): Vector3 {
  const e = easeInOutCubic(t);
  _q.setFromAxisAngle(plan.axis, plan.angle * e);
  return out.copy(plan.from).applyQuaternion(_q).multiplyScalar(flightDistance(plan, t));
}
