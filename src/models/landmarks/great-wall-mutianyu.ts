/**
 * Great Wall at Mutianyu: the wall snakes over green hills (a smooth spline through hill
 * heights), with crenellations along both edges and square watchtowers on the crests.
 */
import { CatmullRomCurve3, type Group, Vector3 } from 'three';
import { BASE_HEIGHT, base, beam, box, cone, lathe, type Vec3Like } from '../kit';

interface Hill {
  x: number;
  z: number;
  r: number;
  h: number;
}

const HILLS: readonly Hill[] = [
  { x: -0.42, z: 0.05, r: 0.42, h: 0.24 },
  { x: 0.25, z: -0.08, r: 0.5, h: 0.3 },
  { x: 0.6, z: 0.42, r: 0.28, h: 0.12 },
  { x: -0.3, z: -0.55, r: 0.3, h: 0.12 },
];

/** Hill profile: a smooth cosine bump. */
const bump = (h: Hill, d: number): number =>
  d >= h.r ? 0 : h.h * Math.cos((d / h.r) * (Math.PI / 2)) ** 2;

/** Ground height (above the base disc) at (x, z). */
const ground = (x: number, z: number): number =>
  HILLS.reduce((m, h) => Math.max(m, bump(h, Math.hypot(x - h.x, z - h.z))), 0);

const WALL_W = 0.09;
const WALL_H = 0.08;

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.9));
  for (const [i, h] of HILLS.entries()) {
    const profile: [number, number][] = [];
    for (let k = 0; k <= 5; k++) {
      const d = h.r * (1 - k / 5);
      profile.push([d, bump(h, d)]);
    }
    g.add(
      lathe(profile, i % 2 ? 'leafDark' : 'leaf', { segments: 10, at: [h.x, y0 - 0.002, h.z] }),
    );
  }

  // The wall's path over the crests, sampled into short straight runs.
  const path = new CatmullRomCurve3(
    [
      [-0.82, 0.25],
      [-0.6, 0.12],
      [-0.42, 0.05],
      [-0.15, -0.02],
      [0.08, -0.12],
      [0.25, -0.08],
      [0.48, 0.1],
      [0.62, 0.38],
    ].map(([x, z]) => new Vector3(x, 0, z)),
  );
  const n = 26;
  const pts = path.getSpacedPoints(n).map((p): Vec3Like => [p.x, y0 + ground(p.x, p.z), p.z]);
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    // Centre line half a wall up; runs overlap a little so joints don't gap.
    const up = (p: Vec3Like): Vec3Like => [p[0], p[1] + WALL_H / 2 - 0.01, p[2]];
    g.add(beam(up(a), up(b), WALL_W, 'stone', WALL_H + 0.02));
    // A crenel on each edge.
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(-dz, dx);
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[2] + b[2]) / 2;
    const my = (a[1] + b[1]) / 2 + WALL_H;
    for (const s of [-1, 1]) {
      const ox = (-dz / len) * s * (WALL_W / 2 - 0.006);
      const oz = (dx / len) * s * (WALL_W / 2 - 0.006);
      g.add(
        box(0.024, 0.03, 0.016, 'stoneDark', {
          at: [mx + ox, my - 0.002, mz + oz],
          rot: [0, yaw, 0],
        }),
      );
    }
  }

  // Watchtowers on the crests and at the ends.
  for (const i of [2, 9, 15, 21]) {
    const [x, y, z] = pts[i]!;
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n, i + 1)]!;
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    const r = [0, yaw, 0] as const;
    g.add(box(0.16, 0.2, 0.16, 'stone', { at: [x, y - 0.02, z], rot: r }));
    g.add(box(0.18, 0.025, 0.18, 'stoneDark', { at: [x, y + 0.18, z], rot: r }));
    // Windows on the two long sides.
    for (const s of [-1, 1]) {
      const ox = Math.sin(yaw) * s * 0.081;
      const oz = Math.cos(yaw) * s * 0.081;
      g.add(box(0.04, 0.05, 0.004, 'ink', { at: [x + ox, y + 0.07, z + oz], rot: r }));
    }
    if (i === 9) {
      // The tallest tower wears a little red roof.
      g.add(
        cone(0.14, 0.09, 'roofRed', {
          segments: 4,
          at: [x, y + 0.205, z],
          rot: [0, yaw + Math.PI / 4, 0],
        }),
      );
    }
  }

  // Trees on the slopes.
  const trees: [number, number][] = [
    [-0.55, -0.2],
    [-0.2, 0.3],
    [0.05, 0.25],
    [0.4, -0.35],
    [0.1, -0.45],
    [-0.62, 0.45],
    [0.7, -0.1],
    [-0.35, -0.6],
  ];
  for (const [x, z] of trees) {
    g.add(cone(0.04, 0.11, 'leafDark', { segments: 6, at: [x, y0 + ground(x, z) - 0.01, z] }));
  }
}
