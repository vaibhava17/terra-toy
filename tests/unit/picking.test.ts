import { describe, expect, it } from 'vitest';
import { Ray, Vector3 } from 'three';
import { TAP_SLOP_PX, intersectGlobe, isTap } from '../../src/engine/picking';
import { llToVec3, vec3ToLl } from '../../src/engine/geo';

const ray = (o: Vector3, d: Vector3) => new Ray(o, d.clone().normalize());

describe('intersectGlobe', () => {
  it('hits the near side of the globe along the view axis', () => {
    const hit = intersectGlobe(ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), new Vector3());
    expect(hit).not.toBeNull();
    expect(hit!.z).toBeCloseTo(1, 9);
    expect(hit!.length()).toBeCloseTo(1, 9);
  });

  it('round-trips through lat/lng: looking straight down at Paris hits Paris', () => {
    const paris = llToVec3(48.8566, 2.3522);
    const origin = paris.clone().multiplyScalar(2.4);
    const hit = intersectGlobe(ray(origin, paris.clone().negate()), new Vector3())!;
    const ll = vec3ToLl(hit);
    expect(ll.lat).toBeCloseTo(48.8566, 6);
    expect(ll.lng).toBeCloseTo(2.3522, 6);
  });

  it('misses when the ray passes beside the globe or points away from it', () => {
    expect(intersectGlobe(ray(new Vector3(0, 1.01, 3), new Vector3(0, 0, -1)), new Vector3())).toBe(
      null,
    );
    expect(intersectGlobe(ray(new Vector3(0, 0, 3), new Vector3(0, 0, 1)), new Vector3())).toBe(
      null,
    );
  });

  it('grazes the limb and exits from inside', () => {
    const graze = intersectGlobe(ray(new Vector3(0, 1, 3), new Vector3(0, 0, -1)), new Vector3());
    expect(graze?.y).toBeCloseTo(1, 6);
    const inside = intersectGlobe(ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0)), new Vector3());
    expect(inside?.x).toBeCloseTo(1, 9);
  });

  it('supports other radii and writes into the target', () => {
    const target = new Vector3();
    const hit = intersectGlobe(ray(new Vector3(5, 0, 0), new Vector3(-1, 0, 0)), target, 2);
    expect(hit).toBe(target);
    expect(target.x).toBeCloseTo(2, 9);
  });
});

describe('isTap', () => {
  it('accepts tiny movements and rejects drags', () => {
    expect(isTap(100, 100, 100, 100)).toBe(true);
    expect(isTap(100, 100, 103, 104)).toBe(true); // 5 px
    expect(isTap(100, 100, 100 + TAP_SLOP_PX, 100)).toBe(true);
    expect(isTap(100, 100, 107, 100)).toBe(false);
    expect(isTap(100, 100, 200, 100)).toBe(false);
    expect(isTap(0, 0, 10, 0, 12)).toBe(true);
  });
});
