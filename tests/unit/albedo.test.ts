import { describe, expect, it } from 'vitest';
import { geoPath } from 'd3-geo';
import { SphereGeometry, Vector3 } from 'three';
import { llToVec3, vec3ToLl } from '../../src/engine/geo';
import {
  EARTH_PALETTE,
  EARTH_ROUGHNESS,
  POLAR_TINT_STOPS,
  TEXTURE_FLIP_Y,
  llToTexel,
  loadLand,
  makeProjection,
} from '../../src/engine/globe/albedo';
import { mulberry32 } from '../../src/game/rng';

const W = 4096;
const H = 2048;

describe('llToTexel', () => {
  it('puts lng −180 on the left edge and lat +90 on the top edge', () => {
    expect(llToTexel(90, -180, W, H)).toEqual({ x: 0, y: 0 });
    expect(llToTexel(-90, 180, W, H)).toEqual({ x: W, y: H });
    expect(llToTexel(0, 0, W, H)).toEqual({ x: W / 2, y: H / 2 });
    expect(llToTexel(45, 90, W, H)).toEqual({ x: (3 * W) / 4, y: H / 4 });
  });

  it('agrees with the d3 projection used to paint the texture', () => {
    for (const [w, h] of [
      [4096, 2048],
      [2048, 1024],
    ] as const) {
      const proj = makeProjection(w, h);
      const r = mulberry32(7);
      for (let i = 0; i < 200; i++) {
        const lat = r() * 178 - 89;
        const lng = r() * 358 - 179;
        const p = proj([lng, lat]);
        expect(p).not.toBeNull();
        const t = llToTexel(lat, lng, w, h);
        expect(Math.abs(p![0] - t.x)).toBeLessThan(1e-6);
        expect(Math.abs(p![1] - t.y)).toBeLessThan(1e-6);
      }
    }
  });
});

describe('texture orientation vs. SphereGeometry UVs and llToVec3', () => {
  it('every vertex samples the texel for its own lat/lng', () => {
    const geo = new SphereGeometry(1, 128, 64); // same tessellation as the Earth mesh
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    const v = new Vector3();
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const { lat, lng } = vec3ToLl(v);
      // Skip the poles (longitude undefined) and the seam (u = 0 and u = 1 are the same meridian).
      if (Math.abs(lat) > 89.9) continue;
      const u = uv.getX(i);
      if (u < 1e-6 || u > 1 - 1e-6) continue;

      const t = llToTexel(lat, lng, W, H);
      // With flipY the canvas row 0 is uploaded to uv.y = 1.
      const expectedY = TEXTURE_FLIP_Y ? (1 - uv.getY(i)) * H : uv.getY(i) * H;
      expect(Math.abs(t.x - u * W)).toBeLessThan(1e-3);
      expect(Math.abs(t.y - expectedY)).toBeLessThan(1e-3);
      checked++;
    }
    geo.dispose();
    expect(checked).toBeGreaterThan(7000);
  });

  it('named places land where expected on the sphere', () => {
    // Greenwich/equator is at the centre of the texture and on +X of the sphere.
    expect(llToTexel(0, 0, W, H)).toEqual({ x: W / 2, y: H / 2 });
    expect(llToVec3(0, 0).x).toBeCloseTo(1, 12);
    // East is to the right in the texture and toward −Z on the sphere.
    expect(llToTexel(0, 90, W, H).x).toBeGreaterThan(W / 2);
    expect(llToVec3(0, 90).z).toBeCloseTo(-1, 12);
  });
});

describe('palette and roughness', () => {
  it('uses CSS colour strings only', () => {
    for (const c of Object.values(EARTH_PALETTE)) {
      expect(c).toMatch(/^(#[0-9a-f]{6}|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*[\d.]+\))$/i);
    }
  });

  it('polar tint stops run north → south, white at both poles, untinted mid-latitudes', () => {
    const lats = POLAR_TINT_STOPS.map(([lat]) => lat);
    expect(lats[0]).toBe(90);
    expect(lats[lats.length - 1]).toBe(-90);
    for (let i = 1; i < lats.length; i++) expect(lats[i]!).toBeLessThan(lats[i - 1]!);
    expect(POLAR_TINT_STOPS[0]![1]).toBe('ice');
    expect(POLAR_TINT_STOPS[POLAR_TINT_STOPS.length - 1]![1]).toBe('ice');
    expect(POLAR_TINT_STOPS.some(([lat, c]) => lat > 0 && c === 'noTint')).toBe(true);
    expect(POLAR_TINT_STOPS.some(([lat, c]) => lat < 0 && c === 'noTint')).toBe(true);
  });

  it('makes water glossier than land', () => {
    expect(EARTH_ROUGHNESS.water).toBeLessThan(EARTH_ROUGHNESS.land);
    expect(EARTH_ROUGHNESS.water).toBeGreaterThan(0);
    expect(EARTH_ROUGHNESS.land).toBeLessThanOrEqual(1);
  });
});

describe('coastline vs. the antimeridian seam', () => {
  /** Records the line segments geoPath draws, per stroke target. */
  function recordSegments(shape: Parameters<ReturnType<typeof geoPath>>[0], w: number, h: number) {
    const segs: [number, number, number, number][] = [];
    let x0 = 0;
    let y0 = 0;
    let sx = 0;
    let sy = 0;
    const ctx = {
      beginPath() {},
      moveTo(x: number, y: number) {
        x0 = sx = x;
        y0 = sy = y;
      },
      lineTo(x: number, y: number) {
        segs.push([x0, y0, x, y]);
        x0 = x;
        y0 = y;
      },
      closePath() {
        segs.push([x0, y0, sx, sy]);
        x0 = sx;
        y0 = sy;
      },
      arc() {},
    };
    geoPath(makeProjection(w, h), ctx)(shape);
    return segs;
  }

  /** Total stroke length lying on the left/right texture edge (lng ±180). */
  function edgeLength(segs: [number, number, number, number][], w: number): number {
    let total = 0;
    for (const [ax, ay, bx, by] of segs) {
      for (const edge of [0, w]) {
        if (Math.abs(ax - edge) < 0.5 && Math.abs(bx - edge) < 0.5) total += Math.abs(by - ay);
      }
    }
    return total;
  }

  it('the stroked coast has no straight clip edges along ±180° (Chukotka, Antarctica)', async () => {
    const { land, coast } = await loadLand();
    const [w, h] = [4096, 2048];
    // Sanity: the filled polygons do close along the clip edge (that's why we don't stroke them).
    expect(edgeLength(recordSegments(land, w, h), w)).toBeGreaterThan(100);
    // The mesh only carries real coastline: at most a few px of genuine coast near ±180°.
    expect(edgeLength(recordSegments(coast, w, h), w)).toBeLessThan(10);
  });
});
