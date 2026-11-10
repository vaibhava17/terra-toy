/**
 * Christ the Redeemer: the statue, arms wide, on a pedestal atop a steep forested peak
 * (a lathe mountain with a green skirt and a few trees).
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, box, cone, cyl, lathe, sphere } from '../kit';

const PEAK: [number, number][] = [
  [0.66, 0],
  [0.52, 0.1],
  [0.34, 0.26],
  [0.2, 0.42],
  [0.12, 0.5],
  [0.09, 0.53],
  [0, 0.54],
];

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.75, 'leaf'));
  g.add(lathe(PEAK, 'rock', { segments: 10, at: [0, y0, 0] }));
  // Forest climbing the lower slopes.
  g.add(
    lathe(
      [
        [0.675, 0],
        [0.535, 0.1],
        [0.4, 0.21],
        [0.36, 0.24],
      ],
      'leafDark',
      { segments: 10, at: [0, y0, 0] },
    ),
  );
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.5 + (i % 2) * 0.1;
    g.add(
      cone(0.035, 0.1, 'leafDark', {
        segments: 5,
        at: [Math.cos(a) * r, y0 + 0.1 - (i % 2) * 0.06, Math.sin(a) * r],
      }),
    );
  }

  // Summit platform and pedestal.
  const p = y0 + 0.53;
  g.add(cyl(0.11, 0.12, 0.02, 'stone', { segments: 10, at: [0, p, 0] }));
  g.add(box(0.075, 0.08, 0.075, 'stone', { at: [0, p + 0.02, 0] }));
  g.add(box(0.085, 0.01, 0.085, 'cream', { at: [0, p + 0.1, 0] }));

  // The statue (facing −Z): robe, chest, outstretched arms, head.
  const s = p + 0.11;
  g.add(cyl(0.038, 0.05, 0.22, 'marble', { segments: 10, at: [0, s, 0] }));
  g.add(cyl(0.04, 0.038, 0.05, 'marble', { segments: 10, at: [0, s + 0.22, 0] }));
  g.add(box(0.36, 0.034, 0.034, 'marble', { at: [0, s + 0.23, 0] }));
  // Sleeves hanging under the arms.
  for (const x of [-0.1, 0.1]) g.add(box(0.07, 0.03, 0.026, 'marble', { at: [x, s + 0.205, 0] }));
  g.add(cyl(0.012, 0.014, 0.02, 'marble', { segments: 6, at: [0, s + 0.27, 0] }));
  g.add(sphere(0.03, 'marble', { lowSeg: 8, at: [0, s + 0.31, 0] }));
}
