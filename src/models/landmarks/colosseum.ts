/**
 * Colosseum: an elliptical ring of arch panels in three tiers plus a solid attic on the
 * north side, worn down to two tiers on the south side, around stepped seating and a
 * sandy arena floor with the maze of the hypogeum showing.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, arch, base, box, cyl, lathe } from '../kit';

/** Semi-axes of the outer wall (x: east–west, z: north–south). */
const A = 0.5;
const B = 0.4;
const ARCHES = 16;
const TIER_H = 0.1;

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.64));
  // Arena floor and the hypogeum walls.
  g.add(cyl(0.22, 0.22, 0.008, 'sand', { segments: 12, at: [0, y0, 0], scale: [1, 1, 0.66] }));
  for (const z of [-0.06, 0, 0.06]) g.add(box(0.26, 0.016, 0.01, 'stoneDark', { at: [0, y0, z] }));
  g.add(box(0.01, 0.016, 0.16, 'stoneDark', { at: [0, y0, 0] }));
  // Seating: a sloped bowl from the arena wall up to the outer wall.
  g.add(
    lathe(
      [
        [0.22, 0.0],
        [0.22, 0.04],
        [0.3, 0.1],
        [0.38, 0.17],
        [0.45, 0.25],
        [0.47, 0.25],
        [0.47, 0],
      ],
      'stone',
      { segments: 12, at: [0, y0, 0], scale: [1, 1, B / A] },
    ),
  );

  // The outer wall, one panel per step around the ellipse.
  const point = (t: number): [number, number] => [A * Math.cos(t), B * Math.sin(t)];
  for (let i = 0; i < ARCHES; i++) {
    const t0 = (i / ARCHES) * Math.PI * 2;
    const t1 = ((i + 1) / ARCHES) * Math.PI * 2;
    const [x0, z0] = point(t0);
    const [x1, z1] = point(t1);
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const w = Math.hypot(x1 - x0, z1 - z0) * 1.04;
    // Local X along the chord, local Z (the panel's thickness) across it.
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const rot = [0, yaw, 0] as const;
    // The south side (+Z) has lost its upper tiers.
    const south = z / B > 0.25;
    const tiers = south ? 2 : 3;
    for (let k = 0; k < tiers; k++) {
      g.add(
        arch(w, TIER_H, 0.04, 'sandstone', { opening: 0.58, at: [x, y0 + k * TIER_H, z], rot }),
      );
      g.add(box(w, 0.008, 0.046, 'cream', { at: [x, y0 + (k + 1) * TIER_H - 0.004, z], rot }));
    }
    if (!south) g.add(box(w, 0.06, 0.04, 'sandstone', { at: [x, y0 + 3 * TIER_H, z], rot }));
    else if (z / B < 0.6) {
      // A ragged broken edge where the wall drops down.
      g.add(box(w * 0.5, 0.05, 0.04, 'sandstone', { at: [x, y0 + 2 * TIER_H, z], rot }));
    }
  }
}
