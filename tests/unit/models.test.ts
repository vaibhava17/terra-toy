/**
 * Procedural model kit and builders (PLAN §5.1): every registered builder builds, bakes
 * within budget, sits on the ground and uses palette colours only.
 */
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import {
  MAX_RADIAL_SEGMENTS,
  PALETTE,
  SWATCHES,
  arch,
  bake,
  beam,
  box,
  clampSegments,
  cone,
  cyl,
  getBakedMaterial,
  lathe,
  ring,
  sphere,
  stairs,
  swatchColor,
  triangleCount,
  tube,
} from '../../src/models/kit';
import { MODELS, MODEL_IDS, buildModel, loadModel } from '../../src/models/index';

/** Landmark budget (PLAN §5.1). */
const LANDMARK_TRIANGLES = 3000;

const palette = SWATCHES.map((s) => swatchColor(s));
const isPaletteColour = (r: number, g: number, b: number): boolean =>
  palette.some(
    (c) => Math.abs(c.r - r) < 1e-4 && Math.abs(c.g - g) < 1e-4 && Math.abs(c.b - b) < 1e-4,
  );

const STARTERS = [
  'eiffel-tower',
  'statue-of-liberty',
  'great-pyramid-giza',
  'taj-mahal',
  'great-wall-mutianyu',
  'mount-fuji',
  'sydney-opera-house',
  'christ-the-redeemer',
  'big-ben',
  'colosseum',
];

describe('model kit', () => {
  it('has about 32 distinct palette swatches, as hex strings', () => {
    expect(SWATCHES.length).toBeGreaterThanOrEqual(28);
    expect(SWATCHES.length).toBeLessThanOrEqual(40);
    for (const s of SWATCHES) expect(PALETTE[s]).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(Object.values(PALETTE)).size).toBe(SWATCHES.length);
    expect(swatchColor('gold')).toBeInstanceOf(Color);
  });

  it('clamps radial segments to at most 12', () => {
    expect(clampSegments(64)).toBe(MAX_RADIAL_SEGMENTS);
    expect(clampSegments(1)).toBe(3);
    expect(clampSegments(Number.NaN)).toBe(MAX_RADIAL_SEGMENTS);
    const tris = (m: Mesh) => triangleCount(m.geometry);
    expect(tris(cyl(1, 1, 1, 'stone', { segments: 64 }))).toBe(
      tris(cyl(1, 1, 1, 'stone', { segments: 12 })),
    );
    expect(tris(cone(1, 1, 'stone', { segments: 99 }))).toBe(
      tris(cone(1, 1, 'stone', { segments: 12 })),
    );
    expect(tris(sphere(1, 'stone', { lowSeg: 40 }))).toBe(tris(sphere(1, 'stone', { lowSeg: 12 })));
    const lathe64 = lathe(
      [
        [1, 0],
        [0, 1],
      ],
      'stone',
      { segments: 64 },
    );
    expect(tris(lathe64)).toBe(
      tris(
        lathe(
          [
            [1, 0],
            [0, 1],
          ],
          'stone',
          { segments: 12 },
        ),
      ),
    );
    expect(
      tris(
        tube(
          [
            [0, 0, 0],
            [1, 1, 0],
            [2, 0, 0],
          ],
          0.1,
          'stone',
          { radialSegments: 50 },
        ),
      ),
    ).toBe(
      tris(
        tube(
          [
            [0, 0, 0],
            [1, 1, 0],
            [2, 0, 0],
          ],
          0.1,
          'stone',
          { radialSegments: 12 },
        ),
      ),
    );
  });

  it('stands box, cylinder, cone, ring, stairs and arch on their origin', () => {
    for (const m of [
      box(1, 2, 1, 'stone'),
      cyl(0.5, 0.5, 2, 'stone'),
      cone(0.5, 2, 'stone'),
      ring(0.4, 0.5, 2, 'stone'),
      stairs(4, 1, 2, 1, 'stone'),
      arch(1, 2, 0.2, 'stone'),
    ]) {
      m.geometry.computeBoundingBox();
      expect(m.geometry.boundingBox!.min.y).toBeCloseTo(0, 6);
      expect(m.geometry.boundingBox!.max.y).toBeCloseTo(2, 6);
    }
  });

  it('makes stairs and arches with real geometry', () => {
    const s = stairs(5, 1, 0.5, 1, 'stone');
    expect(triangleCount(s.geometry)).toBe(5 * 12);
    const a = arch(1, 1, 0.1, 'stone');
    expect(triangleCount(a.geometry)).toBeGreaterThan(12);
    // The opening goes all the way through: no geometry at the middle of the doorway's foot.
    const pos = a.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.01) expect(Math.abs(pos.getX(i))).toBeGreaterThan(0.2);
    }
  });

  it('points a beam from a to b', () => {
    const m = beam([0, 0, 0], [1, 0, 0], 0.1, 'stone', 0.3);
    m.updateMatrixWorld();
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.x).toBeCloseTo(0, 6);
    expect(bb.max.x).toBeCloseTo(1, 6);
    expect(bb.max.y - bb.min.y).toBeCloseTo(0.3, 6); // depth stays upright
  });

  it('bakes into one vertex-coloured mesh, keeping anim:* parts separate', () => {
    const g = new Group();
    g.add(box(1, 1, 1, 'brick'), cone(0.5, 1, 'roofRed', { at: [0, 1, 0] }));
    const prop = new Group();
    prop.name = 'anim:prop';
    prop.position.set(0, 2, 0);
    prop.add(box(0.2, 0.2, 0.2, 'gold'));
    g.add(prop);
    const baked = bake(g);
    const meshes = baked.object.children as Mesh[];
    expect(meshes.map((m) => m.name)).toEqual(['baked', 'anim:prop']);
    expect(meshes[1]!.position.y).toBeCloseTo(2, 9);
    for (const m of meshes) {
      expect(m.material).toBe(getBakedMaterial());
      expect(m.geometry.getAttribute('color').itemSize).toBe(3);
    }
    expect((getBakedMaterial() as MeshStandardMaterial).vertexColors).toBe(true);
    expect(baked.triangles).toBe(12 + triangleCount(cone(0.5, 1, 'roofRed').geometry) + 12);
    expect(baked.max.y).toBeCloseTo(2.2, 6);
    expect(baked.geometries).toHaveLength(2);
  });
});

describe('model registry', () => {
  it('registers the 10 starter landmarks', () => {
    expect([...MODEL_IDS].sort()).toEqual(STARTERS.map((id) => `landmarks/${id}`).sort());
  });

  it('caches loaded models per id and rejects unknown ids', async () => {
    const a = await loadModel('landmarks/big-ben');
    const b = await loadModel('landmarks/big-ben');
    expect(a).toBe(b);
    await expect(loadModel('landmarks/atlantis')).rejects.toThrow(/Unknown model/);
  });
});

describe.each(MODEL_IDS)('builder %s', (id) => {
  it('builds, bakes within budget, sits on the ground and uses palette colours only', async () => {
    const { default: build } = await MODELS[id]!();
    const baked = buildModel(build, id);
    expect(baked.triangles).toBeGreaterThan(50);
    expect(baked.triangles).toBeLessThanOrEqual(LANDMARK_TRIANGLES);
    // Static landmarks bake into exactly one mesh.
    expect(baked.object.children).toHaveLength(1);

    expect(baked.min.y).toBeGreaterThan(-1e-3);
    expect(baked.min.y).toBeLessThan(1e-3);
    expect(baked.max.y).toBeGreaterThan(0.3);
    expect(baked.max.y).toBeLessThan(1.2);
    // Roughly centred on the origin, about a unit across.
    expect(Math.max(-baked.min.x, baked.max.x, -baked.min.z, baked.max.z)).toBeLessThan(1.1);

    for (const geo of baked.geometries as BufferGeometry[]) {
      const pos = geo.getAttribute('position');
      const col = geo.getAttribute('color');
      expect(col.count).toBe(pos.count);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      }
      for (let i = 0; i < col.count; i++) {
        if (!isPaletteColour(col.getX(i), col.getY(i), col.getZ(i))) {
          throw new Error(`${id}: vertex ${i} has a colour outside the palette`);
        }
      }
    }
  });
});
