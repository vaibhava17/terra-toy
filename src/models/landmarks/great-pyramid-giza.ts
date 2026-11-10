/**
 * The pyramids of Giza: three four-sided cones (with a gold cap on the biggest), a little
 * sphinx keeping watch, and two palm trees on the sand.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, box, cone, cyl } from '../kit';

/** A pyramid with its faces square to the axes. */
function pyramid(g: Group, x: number, z: number, r: number, h: number, cap: boolean): void {
  const y0 = BASE_HEIGHT;
  const opts = { segments: 4, rot: [0, Math.PI / 4, 0] as const };
  g.add(cone(r, h, 'sandstone', { ...opts, at: [x, y0, z] }));
  // The bottom courses, a shade darker.
  g.add(cyl(r * 0.94, r * 1.02, h * 0.06, 'sand', { ...opts, at: [x, y0, z] }));
  if (cap) {
    const ch = h * 0.12;
    g.add(cone(r * 0.12 + 0.006, ch + 0.004, 'gold', { ...opts, at: [x, y0 + h - ch, z] }));
  }
}

function palm(g: Group, x: number, z: number): void {
  const y0 = BASE_HEIGHT;
  g.add(cyl(0.012, 0.018, 0.16, 'wood', { segments: 5, at: [x, y0, z], rot: [0, 0, 0.12] }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(
      cone(0.016, 0.09, 'leaf', {
        segments: 3,
        at: [x - 0.02, y0 + 0.16, z],
        rot: [Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9],
      }),
    );
  }
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.95, 'sand'));
  pyramid(g, -0.2, -0.12, 0.5, 0.95, true);
  pyramid(g, 0.4, 0.34, 0.34, 0.66, false);
  pyramid(g, 0.6, -0.42, 0.2, 0.38, false);

  // The sphinx, lying down and facing −Z.
  const sx = -0.42;
  const sz = 0.6;
  g.add(box(0.07, 0.05, 0.2, 'sandstone', { at: [sx, y0, sz] }));
  g.add(box(0.06, 0.03, 0.06, 'sandstone', { at: [sx, y0, sz - 0.12] })); // paws
  g.add(box(0.05, 0.07, 0.05, 'sandstone', { at: [sx, y0 + 0.04, sz - 0.08] })); // head
  g.add(box(0.07, 0.04, 0.03, 'gold', { at: [sx, y0 + 0.07, sz - 0.06] })); // headdress

  palm(g, 0.05, 0.72);
  palm(g, -0.72, 0.15);
}
