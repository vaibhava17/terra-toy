/**
 * Pure math for landmark pins (PLAN §3.3): scale-by-zoom, horizon cull, minZoom, and
 * proxy-sphere picking. Three's math classes only — no scene, renderer or DOM.
 * Unit-tested in tests/unit/landmarkMath.test.ts.
 *
 * Globe radius is 1; "distance" is the camera's distance from the globe centre, and the
 * camera's height above the ground ("altitude") is distance − 1.
 */
import type { Ray, Vector3 } from 'three';
import { MAX_DISTANCE, MIN_DISTANCE, clamp } from '../rigMath';

// ---- Scale by zoom -------------------------------------------------------------------

/** Pin scale per unit of camera altitude: `k = clamp(altitude · c, min, max)`. */
export const PIN_SCALE_PER_ALTITUDE = 0.02;
export const MIN_PIN_SCALE = 0.004;
export const MAX_PIN_SCALE = 0.05;
/** The selected landmark's pin is drawn (and picked) this much bigger. */
export const SELECTED_PIN_GROWTH = 1.35;

/**
 * World scale for a pin authored in "pin units" (≈1.5 units tall). Proportional to the
 * camera's altitude, so a pin covers about the same number of pixels at every zoom,
 * clamped so it never vanishes or swamps a continent. Non-decreasing in distance.
 */
export function pinScaleForDistance(distance: number): number {
  const altitude = Math.max(0, distance - 1);
  return clamp(altitude * PIN_SCALE_PER_ALTITUDE, MIN_PIN_SCALE, MAX_PIN_SCALE);
}

// ---- Horizon cull --------------------------------------------------------------------

/**
 * The horizon as a dot product: a surface point with unit normal `n` can be seen from a
 * camera at distance `d` exactly when `dot(n, camDir) > 1/d` (the tangent cone from the
 * camera touches the sphere there). Inside the globe nothing is visible (returns > 1).
 */
export function horizonDot(distance: number): number {
  return distance > 0 ? 1 / distance : Infinity;
}

/** True if the surface point with unit normal `normal` faces a camera at `cameraPos`. */
export function isAboveHorizon(normal: Vector3, cameraPos: Vector3): boolean {
  const d = cameraPos.length();
  if (d <= 1) return false;
  return normal.dot(cameraPos) / d > horizonDot(d);
}

// ---- Zoom levels (for `minZoom` in content) ------------------------------------------

/** Camera altitude at zoom level 0: fully zoomed out. */
const ZOOM0_ALTITUDE = MAX_DISTANCE - 1;

/**
 * Zoom level for a camera distance: 0 when fully zoomed out (MAX_DISTANCE), +1 each time
 * the camera's height above the ground halves. So zoom = log2(3.5 / altitude): about 0.8
 * at the start view (distance 3), 2.8 at distance 1.5, and 3.8 fully zoomed in (1.25).
 * This is the scale a landmark's `minZoom` uses.
 */
export function zoomLevelForDistance(distance: number): number {
  const altitude = Math.max(1e-6, distance - 1);
  return Math.log2(ZOOM0_ALTITUDE / altitude);
}

/** True if a landmark with this `minZoom` (undefined: always) shows at `distance`. */
export function isZoomVisible(minZoom: number | undefined, distance: number): boolean {
  return minZoom === undefined || zoomLevelForDistance(distance) >= minZoom - 1e-9;
}

// ---- Picking -------------------------------------------------------------------------

/** Proxy sphere, in pin units: centred part-way up the pin, generous enough for fingers. */
export const PIN_PROXY_CENTRE = 0.8;
export const PIN_PROXY_RADIUS = 0.85;

/** An invisible picking sphere for one pin (PLAN §3.3), refreshed by `layoutPinProxy`. */
export interface PinProxy {
  readonly centre: Vector3;
  radius: number;
  /** False when culled (behind the horizon or below `minZoom`): never pickable. */
  visible: boolean;
}

/**
 * Updates `proxy` for a pin standing at unit `normal`, seen from `cameraPos`, drawn at
 * scale `k`. Returns `proxy.visible`.
 */
export function layoutPinProxy(
  normal: Vector3,
  minZoom: number | undefined,
  cameraPos: Vector3,
  k: number,
  proxy: PinProxy,
): boolean {
  proxy.visible = isAboveHorizon(normal, cameraPos) && isZoomVisible(minZoom, cameraPos.length());
  proxy.centre.copy(normal).multiplyScalar(1 + PIN_PROXY_CENTRE * k);
  proxy.radius = PIN_PROXY_RADIUS * k;
  return proxy.visible;
}

/**
 * Distance along `ray` to its first intersection with the sphere (`centre`, `radius`),
 * or null if it misses or the sphere is behind the ray. A ray starting inside hits at 0.
 */
export function raySphereDistance(ray: Ray, centre: Vector3, radius: number): number | null {
  const o = ray.origin;
  const d = ray.direction; // normalised
  const ox = o.x - centre.x;
  const oy = o.y - centre.y;
  const oz = o.z - centre.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0; // inside
  if (b > 0) return null; // outside and pointing away
  const disc = b * b - c;
  if (disc < 0) return null;
  return -b - Math.sqrt(disc);
}

/** Index of the nearest visible proxy the ray hits (O(n) manual sphere test), or −1. */
export function pickPin(ray: Ray, proxies: ReadonlyArray<PinProxy>): number {
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < proxies.length; i++) {
    const p = proxies[i]!;
    if (!p.visible) continue;
    const t = raySphereDistance(ray, p.centre, p.radius);
    if (t !== null && t < bestT) {
      bestT = t;
      best = i;
    }
  }
  return best;
}

// ---- Fly-to --------------------------------------------------------------------------

/**
 * Camera distance for looking at a landmark: close enough to see the area around it,
 * yet outside most of the zoom tilt, so the landmark stays near the middle of the view.
 */
export const LANDMARK_VIEW_DISTANCE = 2;

/** Where to fly for a landmark: in to LANDMARK_VIEW_DISTANCE, but never zooming out. */
export function landmarkFlyDistance(currentDistance: number): number {
  const d = Number.isFinite(currentDistance) ? currentDistance : LANDMARK_VIEW_DISTANCE;
  return clamp(Math.min(d, LANDMARK_VIEW_DISTANCE), MIN_DISTANCE, LANDMARK_VIEW_DISTANCE);
}

// ---- 3D models: icon ↔ live LOD (PLAN §3.3) ------------------------------------------

/**
 * Landmarks with a procedural model swap their pin for the model once the camera comes
 * closer than MODEL_SHOW_DISTANCE, and back once it moves out past MODEL_HIDE_DISTANCE.
 * The gap is hysteresis, so a camera resting on the threshold doesn't flicker. Show sits
 * outside LANDMARK_VIEW_DISTANCE, so flying to a landmark always ends on its model.
 */
export const MODEL_SHOW_DISTANCE = 2.25;
export const MODEL_HIDE_DISTANCE = 2.4;

/** Whether models are shown at `distance`, given whether they were shown last frame. */
export function nextModelsShown(distance: number, wasShown: boolean): boolean {
  if (!Number.isFinite(distance)) return false;
  return wasShown ? distance <= MODEL_HIDE_DISTANCE : distance < MODEL_SHOW_DISTANCE;
}

/** Model scale per unit of camera altitude (models are authored ≈1 unit tall). */
export const MODEL_SCALE_PER_ALTITUDE = 0.05;
export const MIN_MODEL_SCALE = 0.01;
export const MAX_MODEL_SCALE = 0.08;

/**
 * World scale for a model authored in landmark units: like `pinScaleForDistance`, it is
 * proportional to the camera's altitude, so a model keeps a readable on-screen size at
 * every zoom (the toy look, not real scale). `multiplier` is the content's `scale`.
 */
export function modelScaleForDistance(distance: number, multiplier = 1): number {
  const altitude = Math.max(0, distance - 1);
  const k = clamp(altitude * MODEL_SCALE_PER_ALTITUDE, MIN_MODEL_SCALE, MAX_MODEL_SCALE);
  return k * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1);
}

/**
 * Updates a picking proxy for a model standing at unit `normal`, drawn at scale `k`.
 * The model's bounds (in model units, origin on the ground) size the sphere: centred
 * half-way up, radius half the model's largest extent.
 */
export function layoutModelProxy(
  normal: Vector3,
  min: Readonly<{ x: number; y: number; z: number }>,
  max: Readonly<{ x: number; y: number; z: number }>,
  k: number,
  visible: boolean,
  proxy: PinProxy,
): boolean {
  const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  proxy.visible = visible;
  proxy.centre.copy(normal).multiplyScalar(1 + ((min.y + max.y) / 2) * k);
  proxy.radius = (extent / 2) * k;
  return visible;
}
