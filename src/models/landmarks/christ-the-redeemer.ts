/**
 * Christ the Redeemer: the white statue, arms wide, on a pedestal atop Corcovado — a
 * steep rocky cone with green forested flanks (a lathe, with a forest skin on the same
 * profile and a few trees). The statue is about half the model's height.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, box, cone, cyl, lathe, sphere } from '../kit';

/** The peak's profile `[radius, y]`: steep, a little concave, with a small summit. */
const PEAK: ReadonlyArray<readonly [number, number]> = [
  [0.32, 0],
  [0.25, 0.06],
  [0.175, 0.14],
  [0.12, 0.24],
  [0.085, 0.34],
  [0.065, 0.42],
  [0.055, 0.47],
  [0, 0.475],
];

/** The forest skin covers the lower flanks, 2 % proud of the rock. */
const FOREST: ReadonlyArray<readonly [number, number]> = PEAK.slice(0, 4).map(
  ([r, y]): [number, number] => [r * 1.02, y],
);

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.38, 'leafDark'));
  const at = [0, y0, 0] as const;
  g.add(lathe(PEAK, 'rock', { segments: 10, at }));
  g.add(lathe(FOREST, 'leaf', { segments: 10, at }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const r = 0.3 - (i % 2) * 0.08;
    const y = i % 2 ? 0.07 : 0;
    g.add(
      cone(0.03, 0.08, 'leafDark', { segments: 5, at: [Math.cos(a) * r, y0 + y, Math.sin(a) * r] }),
    );
  }

  // Summit platform and pedestal.
  const p = y0 + 0.465;
  g.add(cyl(0.07, 0.075, 0.02, 'stone', { segments: 10, at: [0, p, 0] }));
  g.add(box(0.06, 0.06, 0.06, 'stone', { at: [0, p + 0.02, 0] }));
  g.add(box(0.07, 0.01, 0.07, 'cream', { at: [0, p + 0.08, 0] }));

  // The statue (facing +Z, toward the viewer): robe, chest, outstretched arms, head.
  const s = p + 0.09;
  g.add(cyl(0.038, 0.05, 0.32, 'marble', { segments: 10, at: [0, s, 0] }));
  g.add(cyl(0.042, 0.038, 0.06, 'marble', { segments: 10, at: [0, s + 0.32, 0] }));
  g.add(box(0.44, 0.036, 0.036, 'marble', { at: [0, s + 0.33, 0] }));
  // Sleeves hanging under the arms, and the hands.
  for (const x of [-0.11, 0.11]) g.add(box(0.09, 0.035, 0.028, 'marble', { at: [x, s + 0.3, 0] }));
  for (const x of [-0.225, 0.225])
    g.add(box(0.016, 0.04, 0.03, 'marble', { at: [x, s + 0.32, 0] }));
  g.add(cyl(0.012, 0.014, 0.02, 'marble', { segments: 6, at: [0, s + 0.38, 0] }));
  g.add(sphere(0.032, 'marble', { lowSeg: 8, at: [0, s + 0.425, 0] }));
}
