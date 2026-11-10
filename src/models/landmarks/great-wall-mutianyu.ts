/**
 * Great Wall at Mutianyu: one continuous wall winding along the crest of a green ridge
 * (a polar heightfield), with crenellations along both edges and three square
 * watchtowers on the high points, one wearing a little red roof.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  type Group,
  Vector3,
} from 'three';
import { BASE_HEIGHT, base, box, cone, part, type Vec3Like } from '../kit';

/** The wall's path over the ridge (x, z), west to east. */
const PATH = new CatmullRomCurve3(
  [
    [-0.66, 0.3],
    [-0.42, 0.1],
    [-0.18, 0.16],
    [0.04, -0.04],
    [0.26, -0.16],
    [0.5, -0.04],
    [0.64, 0.24],
  ].map(([x, z]) => new Vector3(x, 0, z)),
);
const SAMPLES = 36;
const PTS = PATH.getSpacedPoints(SAMPLES);

/** Crest height at path parameter t: three high points (the towers) with saddles between. */
const crest = (t: number): number => 0.2 + 0.1 * Math.cos(2 * Math.PI * 1.5 * (t - 0.5)) ** 2;
const TOWERS = [1 / 6, 1 / 2, 5 / 6];

/** Disc the terrain fits in; it falls to the base at the rim. */
const RIM = 0.82;
const RIDGE_WIDTH = 0.24;

/** Nearest path sample to (x, z): its parameter and the horizontal distance. */
function nearest(x: number, z: number): { t: number; d: number } {
  let best = { t: 0, d: Infinity };
  for (const [i, p] of PTS.entries()) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < best.d) best = { t: i / SAMPLES, d };
  }
  return best;
}

/** Ground height (above the base disc) at (x, z): the ridge, fading out toward the rim. */
function ground(x: number, z: number): number {
  const { t, d } = nearest(x, z);
  const r = Math.hypot(x, z);
  const fade = Math.min(1, Math.max(0, (RIM - r) / 0.2));
  return crest(t) * Math.exp(-((d / RIDGE_WIDTH) ** 2)) * fade * fade * (3 - 2 * fade);
}

/** The ridge: a polar grid of `rings` × `sectors` quads over the disc, heights from `ground`. */
function terrain(rings: number, sectors: number): BufferGeometry {
  const at = (i: number, j: number): Vec3Like => {
    const r = (RIM * i) / rings;
    const a = (j / sectors) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    return [x, ground(x, z), z];
  };
  const pos: number[] = [];
  const tri = (a: Vec3Like, b: Vec3Like, c: Vec3Like) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      tri(a, c, b); // counter-clockwise seen from above
      if (i > 0) tri(a, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const WALL_W = 0.08;
const WALL_H = 0.07;

/**
 * The wall as one closed ribbon along the path: two side faces and the walkway, each
 * cross-section dropped into the ground a little so it never floats on a slope.
 */
function wall(pts: readonly Vec3Like[], sides: readonly Vector3[]): BufferGeometry {
  const pos: number[] = [];
  const corner = (i: number, s: number, top: boolean): Vec3Like => {
    const [x, y, z] = pts[i]!;
    const n = sides[i]!;
    const cx = x + n.x * s * (WALL_W / 2);
    const cz = z + n.z * s * (WALL_W / 2);
    return [cx, top ? y + WALL_H : BASE_HEIGHT + ground(cx, cz) - 0.03, cz];
  };
  const quad = (a: Vec3Like, b: Vec3Like, c: Vec3Like, d: Vec3Like) =>
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < pts.length - 1; i++) {
    const [lb0, lt0, rt0, rb0] = [
      corner(i, -1, false),
      corner(i, -1, true),
      corner(i, 1, true),
      corner(i, 1, false),
    ];
    const [lb1, lt1, rt1, rb1] = [
      corner(i + 1, -1, false),
      corner(i + 1, -1, true),
      corner(i + 1, 1, true),
      corner(i + 1, 1, false),
    ];
    quad(lb0, lb1, lt1, lt0);
    quad(lt0, lt1, rt1, rt0);
    quad(rt0, rt1, rb1, rb0);
  }
  // End caps.
  const last = pts.length - 1;
  quad(corner(0, -1, false), corner(0, -1, true), corner(0, 1, true), corner(0, 1, false));
  quad(
    corner(last, 1, false),
    corner(last, 1, true),
    corner(last, -1, true),
    corner(last, -1, false),
  );
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.86));
  g.add(part(terrain(7, 24), 'leaf', { at: [0, y0 - 0.002, 0] }));

  // The walkway follows the crest; `sides` are horizontal unit normals to the path.
  const pts = PTS.map((p, i): Vec3Like => [p.x, y0 + crest(i / SAMPLES) * fadeAt(p), p.z]);
  const sides = PTS.map((_, i) => {
    const a = PTS[Math.max(0, i - 1)]!;
    const b = PTS[Math.min(SAMPLES, i + 1)]!;
    return new Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
  });
  g.add(part(wall(pts, sides), 'stone'));

  // Crenels along both edges of the walkway.
  for (let i = 0; i < SAMPLES; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const n = sides[i]!.clone()
      .add(sides[i + 1]!)
      .normalize();
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2 + WALL_H;
    const mz = (a[2] + b[2]) / 2;
    for (const s of [-1, 1]) {
      const o = s * (WALL_W / 2 - 0.007);
      g.add(
        box(0.022, 0.026, 0.014, 'stoneDark', {
          at: [mx + n.x * o, my - 0.004, mz + n.z * o],
          rot: [0, yaw, 0],
        }),
      );
    }
  }

  // Watchtowers on the high points.
  for (const [k, t] of TOWERS.entries()) {
    const i = Math.round(t * SAMPLES);
    const [x, y, z] = pts[i]!;
    const a = pts[i - 1]!;
    const b = pts[i + 1]!;
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const r = [0, yaw, 0] as const;
    g.add(box(0.13, 0.19, 0.13, 'stone', { at: [x, y - 0.03, z], rot: r }));
    g.add(box(0.15, 0.02, 0.15, 'stoneDark', { at: [x, y + 0.16, z], rot: r }));
    for (const s of [-1, 1]) {
      const ox = Math.sin(yaw) * s * 0.066;
      const oz = Math.cos(yaw) * s * 0.066;
      g.add(box(0.034, 0.045, 0.004, 'ink', { at: [x + ox, y + 0.07, z + oz], rot: r }));
    }
    if (k === 1) {
      g.add(
        cone(0.12, 0.08, 'roofRed', {
          segments: 4,
          at: [x, y + 0.18, z],
          rot: [0, yaw + Math.PI / 4, 0],
        }),
      );
    }
  }

  // Trees on the lower slopes, either side of the ridge.
  const trees: [number, number][] = [
    [-0.5, -0.18],
    [-0.25, 0.42],
    [0.08, 0.3],
    [0.38, -0.42],
    [0.05, -0.36],
    [-0.5, 0.5],
    [0.62, -0.3],
    [0.3, 0.3],
    [-0.2, -0.2],
  ];
  for (const [x, z] of trees) {
    g.add(cone(0.035, 0.1, 'leafDark', { segments: 6, at: [x, y0 + ground(x, z) - 0.01, z] }));
  }
}

/** The rim fade `ground` applies, at a path point (the walkway follows the ground). */
function fadeAt(p: Vector3): number {
  const f = Math.min(1, Math.max(0, (RIM - Math.hypot(p.x, p.z)) / 0.2));
  return f * f * (3 - 2 * f);
}
