import { describe, expect, it } from 'vitest';
import { Ray, Vector3 } from 'three';
import { llToVec3 } from '../../src/engine/geo';
import { MAX_DISTANCE, MIN_DISTANCE } from '../../src/engine/rigMath';
import {
  LANDMARK_VIEW_DISTANCE,
  MAX_MODEL_SCALE,
  MAX_PIN_SCALE,
  MIN_MODEL_SCALE,
  MODEL_HIDE_DISTANCE,
  MODEL_SHOW_DISTANCE,
  MIN_PIN_SCALE,
  PIN_PROXY_RADIUS,
  horizonDot,
  isAboveHorizon,
  isZoomVisible,
  landmarkFlyDistance,
  layoutModelProxy,
  layoutPinProxy,
  modelScaleForDistance,
  nextModelsShown,
  pickPin,
  pinScaleForDistance,
  raySphereDistance,
  zoomLevelForDistance,
  type PinProxy,
} from '../../src/engine/entities/landmarkMath';

const proxy = (): PinProxy => ({ centre: new Vector3(), radius: 0, visible: false });
/** A ray from `from` towards `to`. */
const rayTo = (from: Vector3, to: Vector3) =>
  new Ray(from.clone(), to.clone().sub(from).normalize());

describe('pinScaleForDistance', () => {
  it('grows with camera altitude, within its clamps', () => {
    let prev = 0;
    for (let d = MIN_DISTANCE; d <= MAX_DISTANCE; d += 0.05) {
      const k = pinScaleForDistance(d);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(MIN_PIN_SCALE);
      expect(k).toBeLessThanOrEqual(MAX_PIN_SCALE);
      prev = k;
    }
  });

  it('is proportional to altitude in the middle of the range (constant screen size)', () => {
    expect(pinScaleForDistance(2) / pinScaleForDistance(1.5)).toBeCloseTo(2, 9);
  });

  it('clamps at the extremes, even inside the globe', () => {
    expect(pinScaleForDistance(1)).toBe(MIN_PIN_SCALE);
    expect(pinScaleForDistance(0.5)).toBe(MIN_PIN_SCALE);
    expect(pinScaleForDistance(100)).toBe(MAX_PIN_SCALE);
  });
});

describe('horizon cull', () => {
  const cam = new Vector3(3, 0, 0); // above lat 0, lng 0

  it('uses 1/distance as the horizon dot product', () => {
    expect(horizonDot(2)).toBe(0.5);
    expect(horizonDot(4)).toBe(0.25);
    expect(horizonDot(0)).toBe(Infinity);
  });

  it('shows the point under the camera and hides the far side', () => {
    expect(isAboveHorizon(llToVec3(0, 0), cam)).toBe(true);
    expect(isAboveHorizon(llToVec3(0, 180), cam)).toBe(false);
    expect(isAboveHorizon(llToVec3(0, 90), cam)).toBe(false); // on the 90° rim
  });

  it('puts the horizon at acos(1/d) from the sub-camera point', () => {
    const horizonDeg = (Math.acos(1 / 3) * 180) / Math.PI; // ≈ 70.5°
    expect(isAboveHorizon(llToVec3(0, horizonDeg - 0.5), cam)).toBe(true);
    expect(isAboveHorizon(llToVec3(0, horizonDeg + 0.5), cam)).toBe(false);
    expect(isAboveHorizon(llToVec3(horizonDeg - 0.5, 0), cam)).toBe(true);
  });

  it('sees less of the globe from closer in', () => {
    const p = llToVec3(0, 50);
    expect(isAboveHorizon(p, cam)).toBe(true);
    expect(isAboveHorizon(p, new Vector3(1.25, 0, 0))).toBe(false); // horizon ≈ 36.9°
  });

  it('sees nothing from inside the globe', () => {
    expect(isAboveHorizon(llToVec3(0, 0), new Vector3(0.5, 0, 0))).toBe(false);
  });
});

describe('zoom levels and minZoom', () => {
  it('is 0 fully zoomed out and +1 per halving of the altitude', () => {
    expect(zoomLevelForDistance(MAX_DISTANCE)).toBeCloseTo(0, 9);
    expect(zoomLevelForDistance(1 + (MAX_DISTANCE - 1) / 2)).toBeCloseTo(1, 9);
    expect(zoomLevelForDistance(1 + (MAX_DISTANCE - 1) / 8)).toBeCloseTo(3, 9);
    expect(zoomLevelForDistance(MIN_DISTANCE)).toBeGreaterThan(3.5);
    expect(Number.isFinite(zoomLevelForDistance(1))).toBe(true);
  });

  it('shows landmarks without minZoom at every distance', () => {
    for (const d of [MIN_DISTANCE, 2, 3, MAX_DISTANCE])
      expect(isZoomVisible(undefined, d)).toBe(true);
  });

  it('hides a landmark until the camera reaches its minZoom', () => {
    expect(isZoomVisible(1, MAX_DISTANCE)).toBe(false);
    expect(isZoomVisible(1, 3)).toBe(false); // zoom ≈ 0.81
    expect(isZoomVisible(1, 1 + (MAX_DISTANCE - 1) / 2)).toBe(true); // exactly 1
    expect(isZoomVisible(1, 2)).toBe(true);
    expect(isZoomVisible(0, MAX_DISTANCE)).toBe(true);
  });
});

describe('raySphereDistance', () => {
  const c = new Vector3(0, 0, 0);

  it('hits the near side, misses beside and behind', () => {
    const r = new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    expect(raySphereDistance(r, c, 1)).toBeCloseTo(4, 9);
    expect(raySphereDistance(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), c, 1)).toBe(
      null,
    );
    expect(raySphereDistance(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, 1)), c, 1)).toBe(null);
  });

  it('returns 0 from inside', () => {
    expect(raySphereDistance(new Ray(new Vector3(0, 0, 0.5), new Vector3(1, 0, 0)), c, 1)).toBe(0);
  });
});

describe('layoutPinProxy and pickPin', () => {
  const cam = llToVec3(48.86, 2.29, 2); // above Paris
  const k = pinScaleForDistance(cam.length());

  it('places the proxy above the pin foot, scaled by k', () => {
    const p = proxy();
    const n = llToVec3(48.8584, 2.2945);
    expect(layoutPinProxy(n, undefined, cam, k, p)).toBe(true);
    expect(p.radius).toBeCloseTo(PIN_PROXY_RADIUS * k, 12);
    expect(p.centre.length()).toBeGreaterThan(1);
    expect(p.centre.clone().normalize().dot(n)).toBeCloseTo(1, 9);
  });

  it('picks the pin the ray points at, and the nearest when two line up', () => {
    const near = proxy();
    const far = proxy();
    const other = proxy();
    layoutPinProxy(llToVec3(48.8584, 2.2945), undefined, cam, k, near);
    layoutPinProxy(llToVec3(51.5007, -0.1246), undefined, cam, k, other);
    // A second pin straight behind the first, as seen from the camera.
    far.visible = true;
    far.centre.copy(near.centre).multiplyScalar(0.9);
    far.radius = near.radius;
    const proxies = [far, other, near];
    expect(pickPin(rayTo(cam, near.centre), proxies)).toBe(2);
    expect(pickPin(rayTo(cam, other.centre), proxies)).toBe(1);
    expect(pickPin(rayTo(cam, llToVec3(0, 0)), proxies)).toBe(-1);
  });

  it('never picks a pin on the far side of the globe', () => {
    const front = proxy();
    const back = proxy();
    layoutPinProxy(llToVec3(48.8584, 2.2945), undefined, cam, k, front);
    // Antipode of Paris: behind the globe from this camera.
    expect(layoutPinProxy(llToVec3(-48.8584, -177.7055), undefined, cam, k, back)).toBe(false);
    // A ray aimed straight through the globe at the hidden pin hits nothing.
    expect(pickPin(rayTo(cam, back.centre), [back])).toBe(-1);
    // Even if it would hit the hidden proxy, the visible one in front still wins…
    expect(pickPin(rayTo(cam, back.centre), [back, front])).toBe(1);
    // …and the hidden one alone is never returned, whatever the ray.
    back.radius = 10;
    expect(pickPin(rayTo(cam, back.centre), [back])).toBe(-1);
  });

  it('respects minZoom when laying out', () => {
    const p = proxy();
    const n = llToVec3(48.8584, 2.2945);
    expect(layoutPinProxy(n, 3, llToVec3(48.86, 2.29, 3), k, p)).toBe(false);
    expect(pickPin(rayTo(llToVec3(48.86, 2.29, 3), p.centre), [p])).toBe(-1);
    expect(layoutPinProxy(n, 3, llToVec3(48.86, 2.29, 1.3), k, p)).toBe(true);
  });
});

describe('landmarkFlyDistance', () => {
  it('zooms in to the landmark view distance from further out', () => {
    expect(landmarkFlyDistance(3)).toBe(LANDMARK_VIEW_DISTANCE);
    expect(landmarkFlyDistance(MAX_DISTANCE)).toBe(LANDMARK_VIEW_DISTANCE);
  });

  it('never zooms out, and stays in the zoom range', () => {
    expect(landmarkFlyDistance(1.5)).toBe(1.5);
    expect(landmarkFlyDistance(1)).toBe(MIN_DISTANCE);
    expect(landmarkFlyDistance(Number.NaN)).toBe(LANDMARK_VIEW_DISTANCE);
  });
});

describe('model LOD (icon ↔ live)', () => {
  it('shows models inside the show distance and hides them past the hide distance', () => {
    expect(MODEL_SHOW_DISTANCE).toBeLessThan(MODEL_HIDE_DISTANCE);
    expect(nextModelsShown(3, false)).toBe(false);
    expect(nextModelsShown(MODEL_SHOW_DISTANCE - 0.01, false)).toBe(true);
    expect(nextModelsShown(MODEL_HIDE_DISTANCE + 0.01, true)).toBe(false);
    expect(nextModelsShown(MIN_DISTANCE, false)).toBe(true);
    expect(nextModelsShown(MAX_DISTANCE, true)).toBe(false);
    expect(nextModelsShown(Number.NaN, true)).toBe(false);
  });

  it('keeps its last state between the two thresholds (hysteresis)', () => {
    const between = (MODEL_SHOW_DISTANCE + MODEL_HIDE_DISTANCE) / 2;
    expect(nextModelsShown(between, false)).toBe(false);
    expect(nextModelsShown(between, true)).toBe(true);
    // Walking in and out across the band switches once each way.
    let shown = false;
    const flips: boolean[] = [];
    for (const d of [3, 2.35, 2.3, 2.2, 2.3, 2.35, 2.39, 2.45, 2.3]) {
      const next = nextModelsShown(d, shown);
      if (next !== shown) flips.push(next);
      shown = next;
    }
    expect(flips).toEqual([true, false]);
  });

  it('ends a landmark fly-to with models shown', () => {
    expect(nextModelsShown(landmarkFlyDistance(MAX_DISTANCE), false)).toBe(true);
  });

  it('scales models with altitude, within clamps, times the content multiplier', () => {
    let prev = 0;
    for (let d = MIN_DISTANCE; d <= MAX_DISTANCE; d += 0.05) {
      const k = modelScaleForDistance(d);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(MIN_MODEL_SCALE);
      expect(k).toBeLessThanOrEqual(MAX_MODEL_SCALE);
      prev = k;
    }
    expect(modelScaleForDistance(2, 1.5)).toBeCloseTo(modelScaleForDistance(2) * 1.5, 12);
    expect(modelScaleForDistance(2, 0)).toBe(modelScaleForDistance(2));
    expect(modelScaleForDistance(2, Number.NaN)).toBe(modelScaleForDistance(2));
  });

  it('sizes the picking proxy to the model and picks it', () => {
    const p = proxy();
    const n = llToVec3(48.8584, 2.2945);
    const k = modelScaleForDistance(2);
    layoutModelProxy(n, { x: -0.5, y: 0, z: -0.5 }, { x: 0.5, y: 1, z: 0.5 }, k, true, p);
    expect(p.radius).toBeCloseTo(0.5 * k, 12);
    expect(p.centre.length()).toBeCloseTo(1 + 0.5 * k, 12);
    const cam = llToVec3(48.86, 2.29, 2);
    expect(pickPin(rayTo(cam, p.centre), [p])).toBe(0);
    layoutModelProxy(n, { x: -0.5, y: 0, z: -0.5 }, { x: 0.5, y: 1, z: 0.5 }, k, false, p);
    expect(pickPin(rayTo(cam, p.centre), [p])).toBe(-1);
  });
});
