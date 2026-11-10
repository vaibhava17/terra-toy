/**
 * Taj Mahal: a marble plinth with an octagonal hall, a big arch on each face, the onion
 * dome on its drum, four little domed kiosks, four minarets, and the long garden pool.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, arch, base, box, cone, cyl, lathe, sphere } from '../kit';

/** An onion dome profile `[radius, y]` scaled to radius `r` and height `h`. */
const onion = (r: number, h: number): [number, number][] =>
  (
    [
      [0.8, 0],
      [1, 0.17],
      [1.06, 0.34],
      [0.92, 0.57],
      [0.6, 0.77],
      [0.2, 0.92],
      [0, 1],
    ] as const
  ).map(([x, y]) => [x * r, y * h]);

/** A small kiosk (chhatri): posts under a little dome with a gold tip. */
function chhatri(g: Group, x: number, y: number, z: number, r: number): void {
  g.add(cyl(r, r, r * 1.3, 'marble', { segments: 8, at: [x, y, z] }));
  g.add(lathe(onion(r * 1.05, r * 1.6), 'marble', { segments: 8, at: [x, y + r * 1.3, z] }));
  g.add(cone(r * 0.2, r * 0.9, 'gold', { segments: 4, at: [x, y + r * 2.8, z] }));
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.75));
  // The garden: a long pool with cypress trees along it.
  g.add(box(0.07, 0.006, 0.42, 'water', { at: [0, y0, -0.5] }));
  for (const z of [-0.36, -0.5, -0.64]) {
    for (const x of [-0.1, 0.1])
      g.add(cone(0.025, 0.1, 'leafDark', { segments: 6, at: [x, y0, z] }));
  }

  // Plinth.
  g.add(box(0.86, 0.06, 0.86, 'marble', { at: [0, y0, 0] }));
  g.add(box(0.88, 0.012, 0.88, 'cream', { at: [0, y0 + 0.06, 0] }));
  const p = y0 + 0.072;

  // Octagonal hall with a great arch (iwan) on every main face.
  const hallH = 0.3;
  g.add(cyl(0.27, 0.27, hallH, 'marble', { segments: 8, rot: [0, Math.PI / 8, 0], at: [0, p, 0] }));
  g.add(
    cyl(0.275, 0.275, 0.014, 'cream', {
      segments: 8,
      rot: [0, Math.PI / 8, 0],
      at: [0, p + hallH, 0],
    }),
  );
  const face = 0.27 * Math.cos(Math.PI / 8);
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const sx = -Math.sin(yaw);
    const sz = -Math.cos(yaw);
    g.add(
      box(0.11, 0.17, 0.006, 'stoneDark', {
        at: [sx * face, p + 0.01, sz * face],
        rot: [0, yaw, 0],
      }),
    );
    g.add(
      arch(0.17, 0.25, 0.024, 'cream', {
        opening: 0.62,
        at: [sx * (face + 0.006), p, sz * (face + 0.006)],
        rot: [0, yaw, 0],
      }),
    );
  }

  // Drum, onion dome and gold finial.
  const d0 = p + hallH + 0.014;
  g.add(cyl(0.12, 0.13, 0.07, 'marble', { segments: 12, at: [0, d0, 0] }));
  const domeH = 0.34;
  g.add(lathe(onion(0.15, domeH), 'marble', { segments: 12, at: [0, d0 + 0.07, 0] }));
  const top = d0 + 0.07 + domeH;
  g.add(cyl(0.006, 0.008, 0.07, 'gold', { segments: 4, at: [0, top - 0.01, 0] }));
  g.add(sphere(0.014, 'gold', { lowSeg: 6, at: [0, top + 0.03, 0] }));
  g.add(cone(0.008, 0.05, 'gold', { segments: 4, at: [0, top + 0.045, 0] }));

  // Kiosks on the roof corners.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chhatri(g, sx * 0.17, d0, sz * 0.17, 0.035);

  // Minarets at the plinth corners, with two balconies and a kiosk on top.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 0.38;
      const z = sz * 0.38;
      g.add(cyl(0.024, 0.032, 0.46, 'marble', { segments: 8, at: [x, p, z] }));
      for (const h of [0.16, 0.32, 0.46]) {
        g.add(cyl(0.042, 0.036, 0.014, 'cream', { segments: 8, at: [x, p + h, z] }));
      }
      chhatri(g, x, p + 0.474, z, 0.028);
    }
  }
}
