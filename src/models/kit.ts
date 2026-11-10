/**
 * The procedural model kit (PLAN §5.1): primitive helpers, the shared PALETTE and `bake()`.
 *
 * Builders (`src/models/landmarks/*.ts`) compose the helpers below into a `Group`:
 *   g.add(box(0.4, 0.1, 0.4, 'stone'), cyl(0.05, 0.05, 0.6, 'iron', { at: [0, 0.1, 0] }));
 * Every helper returns a `Mesh` tagged with a palette swatch (`userData.swatch`) and placed
 * by the optional `PartOpts`. Nothing here is rendered as-is: `bake()` merges a built
 * group into one vertex-coloured geometry that shares a single material.
 *
 * Conventions: 1 unit ≈ the model's height, origin on the ground at the footprint centre,
 * +Y up, −Z north/front (matches `surfaceFrame()` in src/engine/geo.ts). `box`, `cyl`,
 * `cone`, `ring`, `stairs` and `arch` stand on their origin (bottom centre); `sphere` and
 * `tube` are centred / absolute; `lathe` profiles and `extrude` shapes are in model units.
 *
 * This is the ONLY file under src/models that may hold colour values (lint-enforced).
 */
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Path,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- Palette ---------------------------------------------------------------------------

/** Named swatches for a bright toy-diorama look. Builders may only use these names. */
export const PALETTE = {
  white: '#fbfaf5',
  cream: '#f3e6c8',
  ink: '#2b2d42',
  stone: '#c9c2b4',
  stoneDark: '#8e877b',
  sandstone: '#e2c08d',
  marble: '#f4f1ea',
  brick: '#b5523b',
  terracotta: '#d9774b',
  roofRed: '#d9483b',
  roofGreen: '#4f9d69',
  roofBlue: '#4a6fa5',
  slate: '#56627a',
  gold: '#f2c14e',
  iron: '#8a5a3c',
  copper: '#5fb3a1',
  copperDark: '#3f8f80',
  snow: '#ffffff',
  ice: '#d6eef8',
  rock: '#9a8f86',
  rockDark: '#6e655e',
  leaf: '#5cb85c',
  leafDark: '#3d8b4f',
  grass: '#8fd16a',
  sand: '#f0d9a0',
  water: '#5bc0eb',
  waterDeep: '#3a8fd1',
  wood: '#a0703f',
  glass: '#a9dcf2',
  clockFace: '#fff4d6',
  flame: '#ff9f1c',
  tile: '#f7f3e3',
  /** Blue-grey with a hint of purple: Mount Fuji's volcanic slopes. */
  volcano: '#8a8fb4',
} as const;

export type Swatch = keyof typeof PALETTE;
export const SWATCHES = Object.keys(PALETTE) as Swatch[];

const colourCache = new Map<Swatch, Color>();
/** A swatch as a three.js Color (linear working space, as vertex colours are read). */
export function swatchColor(name: Swatch): Color {
  let c = colourCache.get(name);
  if (!c) {
    c = new Color(PALETTE[name]);
    colourCache.set(name, c);
  }
  return c;
}

// ---- Part helpers ----------------------------------------------------------------------

export type Vec3Like = readonly [number, number, number];

/**
 * Where a part goes. `rot` is Euler angles in radians applied Z, then X, then Y (order
 * 'YXZ': tip or roll the part first, then yaw it about up). Scale is uniform or per axis.
 */
export interface PartOpts {
  at?: Vec3Like;
  rot?: Vec3Like;
  scale?: number | Vec3Like;
  /** Object name; `anim:*` keeps the part separate (and animatable) after `bake()`. */
  name?: string;
}

/** Most radial segments any helper will make (PLAN §5.1). */
export const MAX_RADIAL_SEGMENTS = 12;

/** Clamps a requested segment count to [min, MAX_RADIAL_SEGMENTS]. */
export function clampSegments(n: number, min = 3): number {
  if (!Number.isFinite(n)) return MAX_RADIAL_SEGMENTS;
  return Math.max(min, Math.min(MAX_RADIAL_SEGMENTS, Math.round(n)));
}

/** Unbaked parts share one throwaway material; `bake()` reads `userData.swatch` instead. */
const DRAFT_MATERIAL = new MeshBasicMaterial();

/** Wraps a geometry as a palette-tagged mesh placed by `opts`. */
export function part(geometry: BufferGeometry, swatch: Swatch, opts: PartOpts = {}): Mesh {
  const mesh = new Mesh(geometry, DRAFT_MATERIAL);
  mesh.userData.swatch = swatch;
  place(mesh, opts);
  return mesh;
}

/** Applies `PartOpts` to any object (handy for groups of parts). */
export function place<T extends Object3D>(obj: T, opts: PartOpts = {}): T {
  if (opts.at) obj.position.set(...opts.at);
  if (opts.rot) obj.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2], 'YXZ');
  if (opts.scale !== undefined) {
    if (typeof opts.scale === 'number') obj.scale.setScalar(opts.scale);
    else obj.scale.set(...opts.scale);
  }
  if (opts.name) obj.name = opts.name;
  return obj;
}

/** A box standing on its origin. */
export function box(w: number, h: number, d: number, swatch: Swatch, opts?: PartOpts): Mesh {
  const g = new BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return part(g, swatch, opts);
}

/** A (possibly tapered) cylinder standing on its origin. 4 segments + rot π/4 = square. */
export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  swatch: Swatch,
  opts?: PartOpts & { segments?: number },
): Mesh {
  const g = new CylinderGeometry(rTop, rBottom, h, clampSegments(opts?.segments ?? 10));
  g.translate(0, h / 2, 0);
  return part(g, swatch, opts);
}

/** A cone standing on its origin. `segments: 4` makes a pyramid. */
export function cone(
  r: number,
  h: number,
  swatch: Swatch,
  opts?: PartOpts & { segments?: number },
): Mesh {
  const g = new ConeGeometry(r, h, clampSegments(opts?.segments ?? 10));
  g.translate(0, h / 2, 0);
  return part(g, swatch, opts);
}

/** A low-segment sphere centred on its origin (`lowSeg` = segments around, ≤ 12). */
export function sphere(r: number, swatch: Swatch, opts?: PartOpts & { lowSeg?: number }): Mesh {
  const w = clampSegments(opts?.lowSeg ?? 8);
  const g = new SphereGeometry(r, w, Math.max(2, Math.round(w * 0.75)));
  return part(g, swatch, opts);
}

/**
 * A lathe around +Y from `profile` points `[radius, y]` (bottom to top).
 * `phiLength < 2π` makes an open shell (e.g. the Opera House sails).
 */
export function lathe(
  profile: ReadonlyArray<readonly [number, number]>,
  swatch: Swatch,
  opts?: PartOpts & { segments?: number; phiStart?: number; phiLength?: number },
): Mesh {
  const pts = profile.map(([r, y]) => new Vector2(Math.max(0, r), y));
  const g = new LatheGeometry(
    pts,
    clampSegments(opts?.segments ?? 10),
    opts?.phiStart ?? 0,
    opts?.phiLength ?? Math.PI * 2,
  );
  return part(g, swatch, opts);
}

/**
 * Extrudes a 2D outline (in the XY plane, model units) `depth` along Z, centred on z = 0.
 * `holes` are cut out (outlines in the same plane).
 */
export function extrude(
  outline: ReadonlyArray<readonly [number, number]> | Shape,
  depth: number,
  swatch: Swatch,
  opts?: PartOpts & { holes?: ReadonlyArray<ReadonlyArray<readonly [number, number]>> },
): Mesh {
  const shape =
    outline instanceof Shape ? outline : new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  for (const hole of opts?.holes ?? []) {
    shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  }
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return part(g, swatch, opts);
}

/** A round tube of radius `r` swept along a smooth curve through `points` (absolute). */
export function tube(
  points: ReadonlyArray<Vec3Like>,
  r: number,
  swatch: Swatch,
  opts?: PartOpts & { segments?: number; radialSegments?: number },
): Mesh {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  const along = Math.max(1, Math.min(64, Math.round(opts?.segments ?? points.length * 4)));
  const g = new TubeGeometry(curve, along, r, clampSegments(opts?.radialSegments ?? 6), false);
  return part(g, swatch, opts);
}

/** A thick ring (hollow cylinder) standing on its origin. */
export function ring(
  inner: number,
  outer: number,
  h: number,
  swatch: Swatch,
  opts?: PartOpts & { segments?: number },
): Mesh {
  const profile: [number, number][] = [
    [inner, 0],
    [outer, 0],
    [outer, h],
    [inner, h],
    [inner, 0],
  ];
  return lathe(profile, swatch, opts);
}

/**
 * A bar from `a` to `b` (absolute): struts, beams, arms, wall runs. `t` is its width
 * (horizontal, across the bar) and `depth` its other thickness, which stays as upright
 * as the bar allows (so a level beam is `depth` tall).
 */
export function beam(a: Vec3Like, b: Vec3Like, t: number, swatch: Swatch, depth = t): Mesh {
  const from = new Vector3(...a);
  const to = new Vector3(...b);
  const g = new BoxGeometry(t, Math.max(1e-6, from.distanceTo(to)), depth);
  const dir = to.clone().sub(from).normalize();
  const side = new Vector3().crossVectors(dir, UP);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0); // vertical bar
  side.normalize();
  const third = new Vector3().crossVectors(side, dir);
  const mesh = part(g, swatch);
  mesh.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(side, dir, third));
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  return mesh;
}

/**
 * A flight of `steps` steps, `w` wide, rising to `h` over `d` (front at −Z, the top step at
 * the back). Merged into one geometry; stands on its origin.
 */
export function stairs(
  steps: number,
  w: number,
  h: number,
  d: number,
  swatch: Swatch,
  opts?: PartOpts,
): Mesh {
  const n = Math.max(1, Math.min(24, Math.round(steps)));
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const sh = (h * (i + 1)) / n;
    const sd = (d * (n - i)) / n;
    const g = new BoxGeometry(w, sh, sd);
    g.translate(0, sh / 2, d / 2 - sd / 2);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const merged = mergeGeometries(parts) ?? new BufferGeometry();
  for (const p of parts) p.dispose();
  return part(merged, swatch, opts);
}

/**
 * A wall panel `w` × `h` (× `depth` along Z) with a round-topped opening, standing on its
 * origin. `opening` is the fraction of the width the arch takes (0.3…0.9).
 */
export function arch(
  w: number,
  h: number,
  depth: number,
  swatch: Swatch,
  opts?: PartOpts & { opening?: number },
): Mesh {
  const ow = (w * Math.max(0.3, Math.min(0.9, opts?.opening ?? 0.6))) / 2; // half opening
  const spring = Math.max(0.05 * h, Math.min(h - ow - 0.06 * h, h * 0.55));
  // One U-shaped outline: left pier, the arch over the opening, right pier, the top.
  const outline: [number, number][] = [
    [-w / 2, 0],
    [-ow, 0],
  ];
  const segs = 5;
  for (let i = segs; i >= 0; i--) {
    const a = (i / segs) * Math.PI;
    outline.push([ow * Math.cos(a), spring + ow * Math.sin(a)]);
  }
  outline.push([ow, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]);
  return extrude(outline, depth, swatch, opts);
}

/** Thickness of the diorama ground disc made by `base()`. */
export const BASE_HEIGHT = 0.025;

/** The diorama ground disc every landmark stands on (top at y = BASE_HEIGHT). */
export function base(r: number, swatch: Swatch = 'grass', opts?: PartOpts): Mesh {
  return cyl(r, r * 1.04, BASE_HEIGHT, swatch, { segments: 12, ...opts });
}

const UP = new Vector3(0, 1, 0);

// ---- Bake ------------------------------------------------------------------------------

/** One material for every baked model: colours live in the vertices. */
let bakedMaterial: MeshStandardMaterial | null = null;
export function getBakedMaterial(): MeshStandardMaterial {
  bakedMaterial ??= new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0,
    side: DoubleSide, // open shells (sails, domes cut by lathe) read from both sides
  });
  return bakedMaterial;
}

/** A model after `bake()`. */
export interface BakedModel {
  /** One mesh for the static parts (named `baked`) plus one mesh per `anim:*` part. */
  readonly object: Group;
  /** Every geometry the bake created (dispose these to free the model). */
  readonly geometries: readonly BufferGeometry[];
  readonly triangles: number;
  /** Bounding box of every part, in model units. */
  readonly min: Vector3;
  readonly max: Vector3;
}

/** Triangles in a geometry (indexed or not). */
export function triangleCount(geometry: BufferGeometry): number {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  const pos = geometry.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
}

const isAnim = (o: Object3D): boolean => o.name.startsWith('anim:');

/** A non-indexed copy of `mesh`'s geometry, moved by `matrix`, with a flat vertex colour. */
function bakePart(mesh: Mesh, matrix: Matrix4): BufferGeometry {
  const src = mesh.geometry;
  const g = src.index ? src.toNonIndexed() : src.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  const swatch = (mesh.userData.swatch as Swatch | undefined) ?? 'white';
  const c = swatchColor(swatch in PALETTE ? swatch : 'white');
  const n = g.getAttribute('position').count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  return g;
}

/** Collects the meshes under `root` (itself included), skipping `anim:*` subtrees. */
function collect(root: Object3D, meshes: Mesh[], anims: Object3D[] | null): void {
  if (root instanceof Mesh) meshes.push(root);
  for (const child of root.children) {
    if (anims && isAnim(child)) anims.push(child);
    else collect(child, meshes, anims);
  }
}

/** Merges `meshes` into one geometry, each in the space `inv · matrixWorld`. */
function mergeInto(meshes: readonly Mesh[], inv: Matrix4): BufferGeometry {
  const parts = meshes.map((m) => bakePart(m, _m.multiplyMatrices(inv, m.matrixWorld)));
  const merged = parts.length > 0 ? mergeGeometries(parts) : null;
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('bake(): parts could not be merged');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Bakes a built group: every static mesh is merged into ONE vertex-coloured geometry
 * (mesh `baked`); each `anim:*` child keeps its own merged mesh and transform. All meshes
 * share `getBakedMaterial()`. The input group is left as it was (parts are copied).
 */
export function bake(g: Group): BakedModel {
  g.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(g.matrixWorld).invert();
  const out = new Group();
  out.name = g.name || 'model';
  const geometries: BufferGeometry[] = [];
  const material = getBakedMaterial();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);

  const statics: Mesh[] = [];
  const anims: Object3D[] = [];
  for (const child of g.children) {
    if (isAnim(child)) anims.push(child);
    else collect(child, statics, anims);
  }

  if (statics.length > 0) {
    const geo = mergeInto(statics, rootInv);
    geometries.push(geo);
    const mesh = new Mesh(geo, material);
    mesh.name = 'baked';
    out.add(mesh);
    min.min(geo.boundingBox!.min);
    max.max(geo.boundingBox!.max);
  }

  for (const anim of anims) {
    const meshes: Mesh[] = [];
    collect(anim, meshes, null);
    if (meshes.length === 0) continue;
    const animInv = new Matrix4().copy(anim.matrixWorld).invert();
    const geo = mergeInto(meshes, animInv);
    geometries.push(geo);
    const mesh = new Mesh(geo, material);
    mesh.name = anim.name;
    _m.multiplyMatrices(rootInv, anim.matrixWorld);
    _m.decompose(mesh.position, mesh.quaternion, mesh.scale);
    out.add(mesh);
    _box.copy(geo.boundingBox!).applyMatrix4(_m);
    min.min(_box.min);
    max.max(_box.max);
  }

  const triangles = geometries.reduce((sum, geo) => sum + triangleCount(geo), 0);
  if (geometries.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
  }
  return { object: out, geometries, triangles, min, max };
}

/** Frees the geometries a builder made (the unbaked parts) once they are baked. */
export function disposeParts(g: Object3D): void {
  g.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
  });
}

const _m = new Matrix4();
const _box = new Box3();
