/**
 * Pointer → globe picking helpers. Pure (three math classes only), unit-tested in
 * tests/unit/picking.test.ts.
 */
import type { Ray, Vector3 } from 'three';

/**
 * Nearest intersection of `ray` with the sphere of radius `r` at the origin (analytic;
 * no mesh raycast). Writes into `target` and returns it, or null if the ray misses or
 * the sphere is entirely behind the ray. A ray starting inside the sphere hits the far
 * side (the exit point).
 */
export function intersectGlobe(ray: Ray, target: Vector3, r = 1): Vector3 | null {
  const o = ray.origin;
  const d = ray.direction; // three keeps Ray directions normalised
  const b = o.dot(d);
  const c = o.lengthSq() - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0) return null;
  return ray.at(t, target);
}

/** A press that moved less than this many CSS px counts as a tap (PLAN §3.3 picking). */
export const TAP_SLOP_PX = 6;

/** True when a press from (x0, y0) released at (x1, y1) is a tap rather than a drag. */
export function isTap(x0: number, y0: number, x1: number, y1: number, slop = TAP_SLOP_PX): boolean {
  return Math.hypot(x1 - x0, y1 - y0) <= slop;
}
