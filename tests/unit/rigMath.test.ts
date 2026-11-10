import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { centralAngle, llToVec3, normalizeLng, vec3ToLl } from '../../src/engine/geo';
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
  tiltedCameraPose,
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

  it('stays within a 3/4 view (≤ 45° from straight down) and is non-increasing in distance', () => {
    // 45° (was 32°): the tilt now orbits around the target instead of pitching the camera
    // in place, so it can lean further while the target stays mid-screen; the toy look
    // wants landmark models seen from 30–45°.
    let prev = Infinity;
    for (const d of range(MIN_DISTANCE, MAX_DISTANCE)) {
      const t = tiltForDistance(d);
      expect(t).toBeLessThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(45 * DEG + 1e-12);
      prev = t;
    }
  });

  it('never tilts the view past the horizon at the closest zoom', () => {
    // From the tilted camera, the angle between straight down (toward the globe centre)
    // and the top edge of the view must not go much beyond the horizon, asin(1/|C|).
    const pos = new Vector3();
    const q = new Quaternion();
    tiltedCameraPose(cameraPosition(20, 30, MIN_DISTANCE), pos, q);
    const forward = new Vector3(0, 0, -1).applyQuaternion(q);
    const nadir = pos.clone().negate().normalize();
    const top = Math.acos(forward.dot(nadir)) + (CAMERA_FOV / 2) * DEG;
    expect(top).toBeLessThan(Math.asin(1 / pos.length()) + 5 * DEG);
  });
});

describe('tiltedCameraPose', () => {
  const W = 1100;
  const H = 760;
  /** A camera like the engine's, posed by the rig for the orbit view (lat, lng, d). */
  function posed(lat: number, lng: number, d: number): PerspectiveCamera {
    const cam = new PerspectiveCamera(CAMERA_FOV, W / H, 0.01, 100);
    tiltedCameraPose(cameraPosition(lat, lng, d), cam.position, cam.quaternion);
    cam.updateMatrixWorld();
    return cam;
  }
  const views = [
    [0, 0],
    [48.8584, 2.2945],
    [-33.8568, 151.2153],
    [-45, -60], // the line of sight is parallel to world Y here at a 45° tilt
    [MAX_CAMERA_LAT, 10],
    [-MAX_CAMERA_LAT, -170],
  ] as const;

  it('keeps the target surface point at the screen centre at every tilting distance', () => {
    for (const [lat, lng] of views) {
      for (const d of range(MIN_DISTANCE, TILT_START_DISTANCE, 40)) {
        const cam = posed(lat, lng, d);
        const p = llToVec3(lat, lng).project(cam);
        // NDC spans 2 per viewport height: 10% of the height is 0.2.
        expect(Math.abs(p.y)).toBeLessThan(0.2);
        expect(Math.abs(p.x)).toBeLessThan(0.2);
        expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-9); // in fact exactly centred
        expect(p.z).toBeLessThan(1); // in front of the camera
      }
    }
  });

  it('views the target at tiltForDistance from straight down, from its slant altitude', () => {
    for (const [lat, lng] of views) {
      for (const d of range(MIN_DISTANCE, MAX_DISTANCE, 40)) {
        const cam = posed(lat, lng, d);
        const n = llToVec3(lat, lng);
        const toCam = cam.position.clone().sub(n);
        expect(toCam.length()).toBeCloseTo(d - 1, 9);
        expect(Math.acos(Math.min(1, toCam.normalize().dot(n)))).toBeCloseTo(tiltForDistance(d), 6);
        expect(cam.position.length()).toBeGreaterThan(1.1); // well above the ground
      }
    }
  });

  it('equals the plain orbit pose where there is no tilt', () => {
    const cam = posed(30, 40, TILT_START_DISTANCE + 0.5);
    const ref = new PerspectiveCamera();
    ref.position.copy(cameraPosition(30, 40, TILT_START_DISTANCE + 0.5));
    ref.lookAt(0, 0, 0);
    expect(cam.position.distanceTo(ref.position)).toBeLessThan(1e-12);
    expect(cam.quaternion.angleTo(ref.quaternion)).toBeLessThan(1e-6);
  });

  it('leans back south of the target, looks north, and never rolls (screen-up is north)', () => {
    for (const [lat, lng] of views) {
      const n = llToVec3(lat, lng);
      const north = llToVec3(Math.min(lat + 0.5, 90), lng)
        .sub(n)
        .normalize();
      for (const d of range(MIN_DISTANCE, MAX_DISTANCE, 40)) {
        const cam = posed(lat, lng, d);
        const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        expect(up.dot(north)).toBeGreaterThan(0.7);
        if (tiltForDistance(d) > 1 * DEG) {
          expect(cam.position.clone().sub(n).dot(north)).toBeLessThan(0);
        }
      }
    }
  });

  it('moves smoothly as the view pans and zooms (no flips)', () => {
    const prev = new PerspectiveCamera();
    for (const [lat0, lng0] of views) {
      let first = true;
      for (let i = 0; i <= 200; i++) {
        const lat = Math.max(
          -MAX_CAMERA_LAT,
          Math.min(MAX_CAMERA_LAT, lat0 + 2 * Math.sin(i * 0.05)),
        );
        const cam = posed(lat, lng0 + i * 0.5, MIN_DISTANCE + i * 0.005);
        if (!first) {
          expect(cam.quaternion.angleTo(prev.quaternion)).toBeLessThan(5 * DEG);
          expect(cam.position.distanceTo(prev.position)).toBeLessThan(0.05);
        }
        prev.position.copy(cam.position);
        prev.quaternion.copy(cam.quaternion);
        first = false;
      }
    }
  });

  it('is finite for a zero orbit position', () => {
    const pos = new Vector3();
    const q = new Quaternion();
    tiltedCameraPose(new Vector3(), pos, q);
    expect(isFiniteVec(pos)).toBe(true);
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

  it('eases latitude and short-way longitude together; angle is the central angle', () => {
    const a = { lat: 51.5, lng: -0.12 };
    const b = { lat: -33.86, lng: 151.21 };
    const plan = fly({ ...a, distance: 3 }, { ...b, distance: 3 });
    expect(plan.angle).toBeCloseTo(centralAngle(a, b), 9);
    for (const t of range(0, 1, 20)) {
      const got = vec3ToLl(sampleFlight(plan, t, out));
      const e = easeInOutCubic(t);
      expect(got.lat).toBeCloseTo(a.lat + (b.lat - a.lat) * e, 9);
      expect(lngDiff(got.lng, a.lng + (b.lng - a.lng) * e)).toBeLessThan(1e-9);
    }
  });

  it('never gets closer to a pole than its endpoints (no pass over the pole)', () => {
    const cases: [number, number, number, number][] = [
      [MAX_CAMERA_LAT, -170, DEFAULT_VIEW.lat, DEFAULT_VIEW.lng],
      [MAX_CAMERA_LAT, 0, MAX_CAMERA_LAT, 180],
      [-MAX_CAMERA_LAT, 30, -MAX_CAMERA_LAT, -150],
      [70, -170, 60, 20],
    ];
    for (const [aLat, aLng, bLat, bLng] of cases) {
      const plan = fly(
        { lat: aLat, lng: aLng, distance: 3 },
        { lat: bLat, lng: bLng, distance: 3 },
      );
      const hi = Math.max(Math.abs(aLat), Math.abs(bLat));
      for (const t of range(0, 1, 100)) {
        expect(Math.abs(vec3ToLl(sampleFlight(plan, t, out)).lat)).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  it('keeps the screen-up direction steady frame to frame (no flip near the poles)', () => {
    // Replays GlobeRig.update's flight frame at 60 fps: position, lookAt(origin), tilt.
    const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100);
    const up = new Vector3();
    const prevUp = new Vector3();
    const origin = new Vector3();
    const cases: [number, number, number, number, number, number][] = [
      // from lat, lng, distance → to lat, lng, distance
      [MAX_CAMERA_LAT, -170, 3, DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance],
      [70, -170, 3, DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance],
      [MAX_CAMERA_LAT, -170, 1.5, DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance],
      [-MAX_CAMERA_LAT, 170, 3, DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance],
      [MAX_CAMERA_LAT, 0, 3, MAX_CAMERA_LAT, 180, 3],
      [20, 10, 3, -33.86, 151.21, 1.8],
    ];
    for (const [aLat, aLng, aD, bLat, bLng, bD] of cases) {
      const plan = fly(
        { lat: aLat, lng: aLng, distance: aD },
        { lat: bLat, lng: bLng, distance: bD },
      );
      const frames = Math.ceil(plan.durationMs / (1000 / 60));
      let worst = 0;
      for (let i = 0; i <= frames; i++) {
        sampleFlight(plan, i / frames, camera.position);
        camera.lookAt(origin);
        const tilt = tiltForDistance(camera.position.length());
        if (tilt > 0) camera.rotateX(tilt);
        up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        if (i > 0) worst = Math.max(worst, up.angleTo(prevUp));
        prevUp.copy(up);
      }
      expect(worst / DEG).toBeLessThan(10);
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
      for (const v of [plan.angle, plan.fromLat, plan.fromLng, plan.toLat, plan.deltaLng]) {
        expect(Number.isFinite(v)).toBe(true);
      }
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
    expect(planFlight(cameraPosition(0, 0, 3), 40, 40, 2, undefined, plan)).toBe(plan);
    // Planning a flight must not mutate the caller's camera position.
    const from = cameraPosition(10, 20, 3);
    const copy = from.clone();
    planFlight(from, 40, 40, 2, undefined, plan);
    expect(from.equals(copy)).toBe(true);
  });
});
