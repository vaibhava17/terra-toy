import { describe, expect, it } from 'vitest';
import { Quaternion, SphereGeometry, Vector3 } from 'three';
import {
  EARTH_RADIUS_KM,
  centralAngle,
  greatCircleInterpolate,
  greatCirclePoints,
  haversineKm,
  llToVec3,
  normalizeLng,
  surfaceFrame,
  vec3ToLl,
  type LatLng,
} from '../../src/engine/geo';
import { mulberry32 } from '../../src/game/rng';

const EPS = 1e-9;

function expectVec(v: Vector3, x: number, y: number, z: number, eps = EPS): void {
  expect(Math.abs(v.x - x)).toBeLessThan(eps);
  expect(Math.abs(v.y - y)).toBeLessThan(eps);
  expect(Math.abs(v.z - z)).toBeLessThan(eps);
}

/** Angular difference between two longitudes in degrees, in [0, 180]. */
function lngDiff(a: number, b: number): number {
  const d = Math.abs(normalizeLng(a - b));
  return Math.min(d, 360 - d);
}

function isFiniteLl(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

describe('llToVec3 / vec3ToLl', () => {
  it('maps lat 0 / lng 0 to +X', () => {
    expectVec(llToVec3(0, 0), 1, 0, 0);
  });

  it('maps lng +90 (east) to −Z and lng −90 to +Z', () => {
    expectVec(llToVec3(0, 90), 0, 0, -1);
    expectVec(llToVec3(0, -90), 0, 0, 1);
  });

  it('maps the poles to ±Y regardless of longitude', () => {
    for (const lng of [-180, -45, 0, 33, 179]) {
      expectVec(llToVec3(90, lng), 0, 1, 0);
      expectVec(llToVec3(-90, lng), 0, -1, 0);
    }
  });

  it('treats lng +180 and −180 as the same point', () => {
    const a = llToVec3(12, 180);
    const b = llToVec3(12, -180);
    expect(a.distanceTo(b)).toBeLessThan(EPS);
    expect(vec3ToLl(a).lng).toBeCloseTo(-180, 9);
  });

  it('matches the PLAN §3.3 formula literally', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const lat = r() * 180 - 90;
      const lng = r() * 360 - 180;
      const p = (lat * Math.PI) / 180;
      const l = ((lng + 180) * Math.PI) / 180;
      expectVec(
        llToVec3(lat, lng),
        -Math.cos(p) * Math.cos(l),
        Math.sin(p),
        Math.cos(p) * Math.sin(l),
        1e-12,
      );
    }
  });

  it('scales by radius and writes into the target', () => {
    const t = new Vector3();
    const out = llToVec3(0, 0, 2.5, t);
    expect(out).toBe(t);
    expectVec(t, 2.5, 0, 0);
  });

  it('vec3ToLl returns lng in [−180, 180) and handles the poles', () => {
    expect(vec3ToLl(new Vector3(0, 1, 0))).toEqual({ lat: 90, lng: 0 });
    expect(vec3ToLl(new Vector3(0, -3, 0))).toEqual({ lat: -90, lng: 0 });
    expect(vec3ToLl(new Vector3(-1, 0, 0)).lng).toBe(-180);
  });

  it('round-trips 1,000 seeded random points', () => {
    const r = mulberry32(20261107);
    for (let i = 0; i < 1000; i++) {
      // Uniform on the sphere.
      const lat = (Math.asin(2 * r() - 1) * 180) / Math.PI;
      const lng = r() * 360 - 180;
      const v = llToVec3(lat, lng);
      expect(Math.abs(v.length() - 1)).toBeLessThan(1e-12);
      const back = vec3ToLl(v);
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-9);
      expect(lngDiff(back.lng, lng)).toBeLessThan(1e-9);
      expect(back.lng).toBeGreaterThanOrEqual(-180);
      expect(back.lng).toBeLessThan(180);
      // And the vector round-trip is exact too.
      expect(llToVec3(back.lat, back.lng).distanceTo(v)).toBeLessThan(1e-12);
    }
  });

  it('matches three.js SphereGeometry vertex positions for the same UV', () => {
    // SphereGeometry: u ∈ [0,1] runs west→east starting at lng −180; uv.y = 1 at the north pole.
    // So lng = u·360 − 180, lat = v·180 − 90.
    const geo = new SphereGeometry(1, 64, 32);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const tmp = new Vector3();
    const vert = new Vector3();
    let maxErr = 0;
    for (let i = 0; i < pos.count; i++) {
      vert.fromBufferAttribute(pos, i);
      const lng = uv.getX(i) * 360 - 180;
      const lat = uv.getY(i) * 180 - 90;
      maxErr = Math.max(maxErr, llToVec3(lat, lng, 1, tmp).distanceTo(vert));
    }
    geo.dispose();
    expect(pos.count).toBe(65 * 33);
    expect(maxErr).toBeLessThan(1e-6);
  });
});

describe('normalizeLng', () => {
  it('wraps into [−180, 180)', () => {
    expect(normalizeLng(180)).toBe(-180);
    expect(normalizeLng(-180)).toBe(-180);
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-190)).toBe(170);
    expect(normalizeLng(720)).toBe(0);
    expect(Object.is(normalizeLng(-0), 0)).toBe(true);
  });
});

describe('haversineKm / centralAngle', () => {
  const london = { lat: 51.5074, lng: -0.1278 };
  const paris = { lat: 48.8566, lng: 2.3522 };
  const jfk = { lat: 40.6413, lng: -73.7781 };
  const lhr = { lat: 51.47, lng: -0.4543 };

  it('London–Paris ≈ 343.5 km', () => {
    expect(Math.abs(haversineKm(london, paris) - 343.5)).toBeLessThan(1);
  });

  it('JFK–LHR ≈ 5540 km', () => {
    expect(Math.abs(haversineKm(jfk, lhr) - 5540)).toBeLessThan(10);
  });

  it('a quarter of the equator is πR/2', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(
      (Math.PI * EARTH_RADIUS_KM) / 2,
      6,
    );
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, 1)).toBeCloseTo(Math.PI / 180, 12);
  });

  it('is symmetric, zero for identical points, and π for antipodes', () => {
    expect(haversineKm(london, paris)).toBeCloseTo(haversineKm(paris, london), 9);
    expect(centralAngle(london, london)).toBe(0);
    expect(centralAngle({ lat: 10, lng: 20 }, { lat: -10, lng: -160 })).toBeCloseTo(Math.PI, 9);
  });

  it('agrees with the dot-product angle on unit vectors', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const a = { lat: r() * 180 - 90, lng: r() * 360 - 180 };
      const b = { lat: r() * 180 - 90, lng: r() * 360 - 180 };
      const dot = llToVec3(a.lat, a.lng).dot(llToVec3(b.lat, b.lng));
      expect(centralAngle(a, b)).toBeCloseTo(Math.acos(Math.min(1, Math.max(-1, dot))), 6);
    }
  });
});

describe('greatCircleInterpolate / greatCirclePoints', () => {
  it('midpoint of two equator points is on the equator halfway between', () => {
    const m = greatCircleInterpolate({ lat: 0, lng: 10 }, { lat: 0, lng: 50 }, 0.5);
    expect(m.lat).toBeCloseTo(0, 9);
    expect(m.lng).toBeCloseTo(30, 9);
  });

  it('returns endpoints exactly', () => {
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: 35.68, lng: 139.69 };
    expect(greatCircleInterpolate(a, b, 0)).toEqual(a);
    expect(greatCircleInterpolate(a, b, 1)).toEqual(b);
    const pts = greatCirclePoints(a, b, 16);
    expect(pts).toHaveLength(17);
    expect(pts[0]).toEqual(a);
    expect(pts[16]).toEqual(b);
  });

  it('every interpolated point is on the unit sphere and evenly spaced', () => {
    const a = { lat: 40.64, lng: -73.78 };
    const b = { lat: 51.47, lng: -0.45 };
    const n = 50;
    const pts = greatCirclePoints(a, b, n);
    const total = centralAngle(a, b);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      expect(Math.abs(llToVec3(p.lat, p.lng).length() - 1)).toBeLessThan(1e-12);
      if (i > 0) expect(centralAngle(pts[i - 1]!, p)).toBeCloseTo(total / n, 9);
    }
  });

  it('returns a for identical points', () => {
    const a = { lat: 12.3, lng: 45.6 };
    expect(greatCircleInterpolate(a, { ...a }, 0.5)).toEqual(a);
  });

  it('handles antipodal points deterministically without NaN', () => {
    const cases: [LatLng, LatLng][] = [
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: -180 },
      ],
      [
        { lat: 30, lng: 40 },
        { lat: -30, lng: -140 },
      ],
      [
        { lat: 90, lng: 0 },
        { lat: -90, lng: 0 },
      ],
    ];
    for (const [a, b] of cases) {
      const pts = greatCirclePoints(a, b, 20);
      for (const p of pts) {
        expect(isFiniteLl(p)).toBe(true);
        expect(Math.abs(llToVec3(p.lat, p.lng).length() - 1)).toBeLessThan(1e-12);
      }
      // The midpoint is a quarter-turn from both ends.
      const mid = greatCircleInterpolate(a, b, 0.5);
      expect(centralAngle(a, mid)).toBeCloseTo(Math.PI / 2, 9);
      expect(centralAngle(b, mid)).toBeCloseTo(Math.PI / 2, 9);
      // Consecutive points are evenly spaced (a single continuous arc).
      for (let i = 1; i < pts.length; i++) {
        expect(centralAngle(pts[i - 1]!, pts[i]!)).toBeCloseTo(Math.PI / 20, 9);
      }
      // Deterministic.
      expect(greatCircleInterpolate(a, b, 0.3)).toEqual(greatCircleInterpolate(a, b, 0.3));
    }
  });

  it('crosses the antimeridian the short way', () => {
    const m = greatCircleInterpolate({ lat: 0, lng: 170 }, { lat: 0, lng: -170 }, 0.5);
    expect(m.lat).toBeCloseTo(0, 9);
    expect(lngDiff(m.lng, 180)).toBeLessThan(1e-9);
    const pts = greatCirclePoints({ lat: 10, lng: 175 }, { lat: -5, lng: -172 }, 10);
    for (const p of pts) expect(lngDiff(p.lng, 180)).toBeLessThan(10);
  });
});

describe('surfaceFrame', () => {
  const X = new Vector3(1, 0, 0);
  const Y = new Vector3(0, 1, 0);
  const Z = new Vector3(0, 0, 1);

  function axes(q: Quaternion): { right: Vector3; up: Vector3; fwd: Vector3 } {
    return {
      right: X.clone().applyQuaternion(q),
      up: Y.clone().applyQuaternion(q),
      fwd: Z.clone().negate().applyQuaternion(q),
    };
  }

  function expectOrthonormal(q: Quaternion): void {
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true);
    expect(Math.abs(q.length() - 1)).toBeLessThan(1e-9);
    const { right, up, fwd } = axes(q);
    for (const v of [right, up, fwd]) expect(Math.abs(v.length() - 1)).toBeLessThan(1e-9);
    expect(Math.abs(right.dot(up))).toBeLessThan(1e-9);
    expect(Math.abs(up.dot(fwd))).toBeLessThan(1e-9);
    expect(Math.abs(right.dot(fwd))).toBeLessThan(1e-9);
    // Right-handed: right × up = back (= −fwd).
    expect(right.clone().cross(up).distanceTo(fwd.clone().negate())).toBeLessThan(1e-9);
  }

  it('maps up to the normal, −Z to north and +X to east (random points)', () => {
    const r = mulberry32(31337);
    const h = 1e-5;
    for (let i = 0; i < 500; i++) {
      const lat = r() * 178 - 89;
      const lng = r() * 360 - 180;
      const q = surfaceFrame(lat, lng);
      expectOrthonormal(q);
      const { right, up, fwd } = axes(q);
      expect(up.distanceTo(llToVec3(lat, lng))).toBeLessThan(1e-9);
      const dLat = llToVec3(lat + h, lng)
        .sub(llToVec3(lat - h, lng))
        .normalize();
      const dLng = llToVec3(lat, lng + h)
        .sub(llToVec3(lat, lng - h))
        .normalize();
      expect(fwd.dot(dLat)).toBeGreaterThan(0.999999);
      expect(right.dot(dLng)).toBeGreaterThan(0.999999);
    }
  });

  it('at lat 0 / lng 0: up = +X, north = +Y, east = −Z', () => {
    const { right, up, fwd } = axes(surfaceFrame(0, 0));
    expectVec(up, 1, 0, 0);
    expectVec(fwd, 0, 1, 0);
    expectVec(right, 0, 0, -1);
  });

  it('is finite and orthonormal at both poles', () => {
    for (const lat of [90, -90]) {
      for (const lng of [-180, 0, 45, 179.9]) {
        const q = surfaceFrame(lat, lng);
        expectOrthonormal(q);
        const { up } = axes(q);
        expectVec(up, 0, Math.sign(lat), 0);
      }
    }
  });

  it('writes into the target quaternion', () => {
    const t = new Quaternion();
    expect(surfaceFrame(10, 20, t)).toBe(t);
  });
});
