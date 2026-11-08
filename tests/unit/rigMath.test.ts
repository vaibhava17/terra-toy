import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  centralAngle,
  greatCircleInterpolate,
  llToVec3,
  normalizeLng,
  vec3ToLl,
} from '../../src/engine/geo';
import {
  CAMERA_FOV,
  MAX_CAMERA_LAT,
  MAX_DISTANCE,
  MAX_ROTATE_SPEED,
  MAX_TILT_DEG,
  MIN_DISTANCE,
  MIN_ROTATE_SPEED,
  TILT_START_DISTANCE,
  cameraPosition,
  clampDistance,
  createFlightPlan,
  easeInOutCubic,
  flightDistance,
  flightDuration,
  planFlight,
  rotateSpeedForDistance,
  sampleFlight,
  tiltForDistance,
  viewFromPosition,
  zoomStep,
} from '../../src/engine/rigMath';
import { DEFAULT_VIEW } from '../../src/engine/view';
import { mulberry32 } from '../../src/game/rng';

const DEG = Math.PI / 180;

/** Samples [lo, hi] at n+1 evenly spaced points. */
function range(lo: number, hi: number, n = 200): number[] {
  return Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
}

function lngDiff(a: number, b: number): number {
  const d = Math.abs(normalizeLng(a - b));
  return Math.min(d, 360 - d);
}

function isFiniteVec(v: Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

describe('easeInOutCubic', () => {
  it('hits the endpoints and the midpoint, clamps outside [0, 1]', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it('is monotonic and symmetric', () => {
    let prev = -Infinity;
    for (const t of range(0, 1)) {
      const e = easeInOutCubic(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      expect(e + easeInOutCubic(1 - t)).toBeCloseTo(1, 12);
      prev = e;
    }
  });
});

describe('clampDistance / zoomStep', () => {
  it('clamps to the zoom range and handles non-finite input', () => {
    expect(clampDistance(0)).toBe(MIN_DISTANCE);
    expect(clampDistance(100)).toBe(MAX_DISTANCE);
    expect(clampDistance(2)).toBe(2);
    expect(clampDistance(Number.NaN)).toBe(MAX_DISTANCE);
    expect(clampDistance(Infinity)).toBe(MAX_DISTANCE);
  });

  it('steps by ×0.7 in and ×1.4 out', () => {
    expect(zoomStep(3, 'in')).toBeCloseTo(2.1, 12);
    expect(zoomStep(3, 'out')).toBeCloseTo(4.2, 12);
  });

  it('clamps at both ends and stays put once clamped', () => {
    expect(zoomStep(1.5, 'in')).toBe(MIN_DISTANCE);
    expect(zoomStep(MIN_DISTANCE, 'in')).toBe(MIN_DISTANCE);
    expect(zoomStep(4, 'out')).toBe(MAX_DISTANCE);
    expect(zoomStep(MAX_DISTANCE, 'out')).toBe(MAX_DISTANCE);
  });

  it('repeated zoom-in reaches MIN_DISTANCE and zoom-out reaches MAX_DISTANCE', () => {
    let d = DEFAULT_VIEW.distance;
    for (let i = 0; i < 10; i++) d = zoomStep(d, 'in');
    expect(d).toBe(MIN_DISTANCE);
    for (let i = 0; i < 10; i++) d = zoomStep(d, 'out');
    expect(d).toBe(MAX_DISTANCE);
  });
});

describe('tiltForDistance', () => {
  it('is zero far away and MAX_TILT_DEG at the closest zoom', () => {
    expect(tiltForDistance(MAX_DISTANCE)).toBe(0);
    expect(tiltForDistance(DEFAULT_VIEW.distance)).toBe(0);
    expect(tiltForDistance(TILT_START_DISTANCE)).toBe(0);
    expect(tiltForDistance(MIN_DISTANCE)).toBeCloseTo(MAX_TILT_DEG * DEG, 12);
    // Clamped beyond the range.
    expect(tiltForDistance(0)).toBeCloseTo(MAX_TILT_DEG * DEG, 12);
    expect(tiltForDistance(100)).toBe(0);
  });

  it('stays gentle (≤ 35°) and is monotonically non-increasing in distance', () => {
    let prev = Infinity;
    for (const d of range(MIN_DISTANCE, MAX_DISTANCE)) {
      const t = tiltForDistance(d);
      expect(t).toBeLessThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(35 * DEG);
      prev = t;
    }
  });

  it('never tilts past the horizon at the closest zoom', () => {
    // Angle from straight down to the horizon at distance d is asin(1/d); the top of the
    // view (tilt + fov/2) must not go much beyond it (a sliver of sky is fine).
    const horizon = Math.asin(1 / MIN_DISTANCE);
    expect(tiltForDistance(MIN_DISTANCE) + (CAMERA_FOV / 2) * DEG).toBeLessThan(horizon + 5 * DEG);
  });
});

describe('rotateSpeedForDistance', () => {
  it('is slower when zoomed in and monotonically non-decreasing in distance', () => {
    let prev = -Infinity;
    for (const d of range(MIN_DISTANCE, MAX_DISTANCE)) {
      const s = rotateSpeedForDistance(d);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(MIN_ROTATE_SPEED);
      expect(s).toBeLessThanOrEqual(MAX_ROTATE_SPEED);
      prev = s;
    }
    expect(rotateSpeedForDistance(MIN_DISTANCE)).toBeLessThan(rotateSpeedForDistance(MAX_DISTANCE));
  });

  it('matches the "grabbed ground" formula (altitude · fov / 2π) mid-range', () => {
    expect(rotateSpeedForDistance(3)).toBeCloseTo((2 * CAMERA_FOV * DEG) / (2 * Math.PI), 12);
  });

  it('is clamped and finite for silly inputs', () => {
    expect(rotateSpeedForDistance(0)).toBe(MIN_ROTATE_SPEED);
    expect(rotateSpeedForDistance(1)).toBe(MIN_ROTATE_SPEED);
    expect(rotateSpeedForDistance(1e6)).toBe(MAX_ROTATE_SPEED);
  });
});

describe('cameraPosition / viewFromPosition', () => {
  it('places the camera above (lat, lng) at the given distance (llToVec3 convention)', () => {
    const p = cameraPosition(0, 0, 3);
    expect(p.distanceTo(new Vector3(3, 0, 0))).toBeLessThan(1e-12);
    expect(cameraPosition(0, 90, 2).distanceTo(new Vector3(0, 0, -2))).toBeLessThan(1e-12);
    const t = new Vector3();
    expect(cameraPosition(10, 20, 2, t)).toBe(t);
  });

  it('round-trips random views', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const lat = r() * 170 - 85;
      const lng = r() * 360 - 180;
      const distance = MIN_DISTANCE + r() * (MAX_DISTANCE - MIN_DISTANCE);
      const v = viewFromPosition(cameraPosition(lat, lng, distance));
      expect(v.lat).toBeCloseTo(lat, 9);
      expect(lngDiff(v.lng, lng)).toBeLessThan(1e-9);
      expect(v.distance).toBeCloseTo(distance, 12);
    }
  });

  it('gives finite values at the poles', () => {
    const v = viewFromPosition(cameraPosition(90, 123, 2));
    expect(v.lat).toBeCloseTo(90, 9);
    expect(Number.isFinite(v.lng)).toBe(true);
  });
});

describe('flightDuration', () => {
  it('grows with arc length and zoom change, within sane bounds', () => {
    const short = flightDuration(0.1, 3, 3);
    const long = flightDuration(Math.PI, 3, 3);
    expect(long).toBeGreaterThan(short);
    expect(flightDuration(0, 3, 1.25)).toBeGreaterThan(flightDuration(0, 3, 3));
    for (const ms of [short, long, flightDuration(Math.PI, 1.25, 4.5)]) {
      expect(ms).toBeGreaterThanOrEqual(350);
      expect(ms).toBeLessThanOrEqual(3000);
    }
  });
});

describe('planFlight / sampleFlight', () => {
  const out = new Vector3();

  function fly(
    from: { lat: number; lng: number; distance: number },
    to: { lat: number; lng: number; distance: number },
  ) {
    const plan = createFlightPlan();
    planFlight(
      cameraPosition(from.lat, from.lng, from.distance),
      to.lat,
      to.lng,
      to.distance,
      undefined,
      plan,
    );
    return plan;
  }

  it('starts at the current camera position and ends exactly at the target', () => {
    const from = { lat: 20, lng: 10, distance: 3 };
    const to = { lat: 35.36, lng: 138.73, distance: 1.8 };
    const plan = fly(from, to);
    expect(sampleFlight(plan, 0, out).distanceTo(cameraPosition(20, 10, 3))).toBeLessThan(1e-9);
    expect(
      sampleFlight(plan, 1, out).distanceTo(cameraPosition(to.lat, to.lng, to.distance)),
    ).toBeLessThan(1e-9);
    // Clamped outside [0, 1].
    expect(
      sampleFlight(plan, 5, out).distanceTo(cameraPosition(to.lat, to.lng, to.distance)),
    ).toBeLessThan(1e-9);
  });

  it('follows the same great circle as geo.greatCircleInterpolate (with easing)', () => {
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: -33.86, lng: 151.21 };
    const plan = fly({ ...a, distance: 3 }, { ...b, distance: 3 });
    expect(plan.angle).toBeCloseTo(centralAngle(a, b), 9);
    for (const t of range(0, 1, 20)) {
      const got = vec3ToLl(sampleFlight(plan, t, out));
      const want = greatCircleInterpolate(a, b, easeInOutCubic(t));
      expect(centralAngle(got, want)).toBeLessThan(1e-9);
    }
  });

  it('crosses the antimeridian the short way (lng 170 → −170)', () => {
    const plan = fly({ lat: 0, lng: 170, distance: 3 }, { lat: 0, lng: -170, distance: 3 });
    expect(plan.angle).toBeCloseTo(20 * DEG, 9);
    for (const t of range(0, 1, 50)) {
      const ll = vec3ToLl(sampleFlight(plan, t, out));
      expect(Math.abs(ll.lat)).toBeLessThan(1e-9);
      expect(lngDiff(ll.lng, 180)).toBeLessThanOrEqual(10 + 1e-9);
    }
    const mid = vec3ToLl(sampleFlight(plan, 0.5, out));
    expect(lngDiff(mid.lng, 180)).toBeLessThan(1e-9);
  });

  it('eases the distance between endpoints, with a hop on long flights, always in range', () => {
    const plan = fly({ lat: 0, lng: 0, distance: 3 }, { lat: 0, lng: 0, distance: 1.5 });
    expect(plan.angle).toBe(0);
    expect(plan.hop).toBe(0);
    let prev = Infinity;
    for (const t of range(0, 1, 50)) {
      const d = flightDistance(plan, t);
      expect(d).toBeLessThanOrEqual(prev + 1e-12); // zooming in: monotonic
      expect(sampleFlight(plan, t, out).length()).toBeCloseTo(d, 12);
      prev = d;
    }
    expect(flightDistance(plan, 0)).toBeCloseTo(3, 12);
    expect(flightDistance(plan, 1)).toBeCloseTo(1.5, 12);

    const long = fly({ lat: 0, lng: 0, distance: 2 }, { lat: 0, lng: 120, distance: 2 });
    expect(long.hop).toBeGreaterThan(0);
    expect(flightDistance(long, 0.5)).toBeGreaterThan(2);
    for (const t of range(0, 1, 50)) {
      const d = flightDistance(long, t);
      expect(d).toBeGreaterThanOrEqual(MIN_DISTANCE);
      expect(d).toBeLessThanOrEqual(MAX_DISTANCE);
    }
  });

  it('clamps the target distance and latitude', () => {
    const plan = fly({ lat: 0, lng: 0, distance: 3 }, { lat: 90, lng: 0, distance: 0.2 });
    expect(plan.toDistance).toBe(MIN_DISTANCE);
    const end = vec3ToLl(sampleFlight(plan, 1, out));
    expect(end.lat).toBeCloseTo(MAX_CAMERA_LAT, 9);
    const south = fly({ lat: 0, lng: 0, distance: 3 }, { lat: -90, lng: 0, distance: 99 });
    expect(south.toDistance).toBe(MAX_DISTANCE);
    expect(vec3ToLl(sampleFlight(south, 1, out)).lat).toBeCloseTo(-MAX_CAMERA_LAT, 9);
  });

  it('has no NaN for identical, antipodal and polar flights', () => {
    const cases: [number, number, number, number][] = [
      [20, 10, 20, 10], // identical
      [0, 0, 0, 180], // antipodal on the equator
      [30, 40, -30, -140], // antipodal
      [MAX_CAMERA_LAT, 0, -MAX_CAMERA_LAT, 180], // antipodal near the poles
      [MAX_CAMERA_LAT, 0, MAX_CAMERA_LAT, 180], // over the pole
      [90, 0, 0, 0], // starting exactly at a pole
      [-90, 45, 10, 10],
    ];
    for (const [aLat, aLng, bLat, bLng] of cases) {
      const plan = fly(
        { lat: aLat, lng: aLng, distance: 2.5 },
        { lat: bLat, lng: bLng, distance: 2 },
      );
      expect(Number.isFinite(plan.angle)).toBe(true);
      expect(isFiniteVec(plan.axis)).toBe(true);
      expect(plan.axis.length()).toBeCloseTo(1, 9);
      for (const t of range(0, 1, 40)) {
        const p = sampleFlight(plan, t, out);
        expect(isFiniteVec(p)).toBe(true);
        expect(p.length()).toBeGreaterThanOrEqual(MIN_DISTANCE - 1e-9);
      }
      const end = sampleFlight(plan, 1, out);
      const want = llToVec3(Math.max(-MAX_CAMERA_LAT, Math.min(MAX_CAMERA_LAT, bLat)), bLng, 2);
      expect(end.distanceTo(want)).toBeLessThan(1e-9);
    }
  });

  it('antipodal flights take a single continuous arc of π', () => {
    const plan = fly({ lat: 0, lng: 0, distance: 3 }, { lat: 0, lng: 180, distance: 3 });
    expect(plan.angle).toBeCloseTo(Math.PI, 12);
    const mid = vec3ToLl(sampleFlight(plan, 0.5, out));
    expect(centralAngle(mid, { lat: 0, lng: 0 })).toBeCloseTo(Math.PI / 2, 9);
  });

  it('honours an explicit duration and falls back to the default for bad ones', () => {
    const plan = createFlightPlan();
    const from = cameraPosition(0, 0, 3);
    expect(planFlight(from, 10, 10, 3, 1234, plan).durationMs).toBe(1234);
    expect(planFlight(from, 10, 10, 3, 0, plan).durationMs).toBe(0);
    const def = planFlight(from, 10, 10, 3, undefined, plan).durationMs;
    expect(planFlight(from, 10, 10, 3, -5, plan).durationMs).toBe(def);
    expect(planFlight(from, 10, 10, 3, Number.NaN, plan).durationMs).toBe(def);
  });

  it('reuses the plan object (no allocation per flight)', () => {
    const plan = createFlightPlan();
    const { from, axis } = plan;
    planFlight(cameraPosition(0, 0, 3), 40, 40, 2, undefined, plan);
    expect(plan.from).toBe(from);
    expect(plan.axis).toBe(axis);
  });
});
