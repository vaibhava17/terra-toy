/**
 * Pure camera math for the GlobeRig: no scene, renderer or DOM. Every curve the
 * rig uses lives here so it can be unit-tested (tests/unit/rigMath.test.ts).
 *
 * Globe radius is 1. "Distance" is the camera's distance from the globe centre.
 */
import { Vector3 } from 'three';
import { llToVec3, normalizeLng, vec3ToLl } from './geo';
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

/**
 * A precomputed flight; sampling it allocates nothing.
 *
 * The camera moves by interpolating latitude and (short-way) longitude, not along
 * the great circle. A great circle between two high-latitude points can pass right
 * over a pole, where `camera.lookAt` (up = +Y) has no stable roll and the picture
 * flips ~180° in one frame. Lat/lng interpolation keeps the latitude between the
 * two endpoint latitudes (both within ±MAX_CAMERA_LAT), so the flight never gets
 * closer to a pole than its endpoints, exactly like OrbitControls' own phi clamp.
 */
export interface FlightPlan {
  fromLat: number;
  fromLng: number;
  toLat: number;
  /** Signed longitude change, degrees, in [−180, 180]: the short way round. */
  deltaLng: number;
  /** Central angle between start and target, radians (0 … π); drives hop and duration. */
  angle: number;
  fromDistance: number;
  toDistance: number;
  /** Extra height at mid-flight so long hops "lift off" and show more of the globe. */
  hop: number;
  durationMs: number;
}

export function createFlightPlan(): FlightPlan {
  return {
    fromLat: 0,
    fromLng: 0,
    toLat: 0,
    deltaLng: 0,
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

const _from = new Vector3();
const _to = new Vector3();
const _cross = new Vector3();

/**
 * Plans a flight from the current camera position to (lat, lng, distance).
 * The target latitude is clamped to ±MAX_CAMERA_LAT and the distance to the zoom range.
 * Longitude goes the short way (so 170° → −170° crosses the antimeridian); an exactly
 * opposite longitude goes east (+180°), deterministically. Writes into `plan` (reused per flight).
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
  if (fromPosition.lengthSq() > 0) _from.copy(fromPosition).normalize();
  else _from.set(1, 0, 0);
  const from = vec3ToLl(_from);
  const toLat = clamp(lat, -MAX_CAMERA_LAT, MAX_CAMERA_LAT);

  plan.fromLat = from.lat;
  plan.fromLng = from.lng;
  plan.toLat = toLat;
  const d = normalizeLng(lng - from.lng); // [−180, 180)
  plan.deltaLng = d === -180 ? 180 : d;

  llToVec3(toLat, lng, 1, _to);
  plan.angle = Math.atan2(_cross.crossVectors(_from, _to).length(), clamp(_from.dot(_to), -1, 1));

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

/**
 * Camera position at flight progress t ∈ [0, 1] (time fraction; easing applied here).
 * Writes into `out`; allocates nothing. t = 0 → start position, t = 1 → exact target.
 */
export function sampleFlight(plan: FlightPlan, t: number, out: Vector3): Vector3 {
  const e = easeInOutCubic(t);
  const lat = plan.fromLat + (plan.toLat - plan.fromLat) * e;
  const lng = plan.fromLng + plan.deltaLng * e;
  return llToVec3(lat, lng, flightDistance(plan, t), out);
}
