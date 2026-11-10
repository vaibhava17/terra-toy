/**
 * Eiffel Tower: four splayed lattice legs joined by arches, two platforms, a tapering
 * top section, a little cabin and the spire. Iron brown on a park lawn.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, arch, base, beam, box, cone, cyl, type Vec3Like } from '../kit';

const lerp3 = (a: Vec3Like, b: Vec3Like, t: number): Vec3Like => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Adds an X brace on each of the four faces between two leg sections. */
function braces(
  g: Group,
  legs: ReadonlyArray<readonly [Vec3Like, Vec3Like]>,
  t0: number,
  t1: number,
) {
  const order = [0, 1, 3, 2]; // legs around the square
  for (let i = 0; i < 4; i++) {
    const [a0, a1] = legs[order[i]!]!;
    const [b0, b1] = legs[order[(i + 1) % 4]!]!;
    g.add(beam(lerp3(a0, a1, t0), lerp3(b0, b1, t1), 0.012, 'iron'));
    g.add(beam(lerp3(a0, a1, t1), lerp3(b0, b1, t0), 0.012, 'iron'));
  }
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.48));
  // Gravel paths crossing the lawn.
  g.add(box(0.9, 0.004, 0.1, 'sand', { at: [0, y0, 0] }));
  g.add(box(0.1, 0.004, 0.9, 'sand', { at: [0, y0, 0] }));

  // Lower legs: from the four stone piers up to the first platform.
  const foot = 0.25;
  const h1 = 0.32;
  const top1 = 0.1;
  const lower: [Vec3Like, Vec3Like][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a: Vec3Like = [sx * foot, y0, sz * foot];
      const b: Vec3Like = [sx * top1, h1, sz * top1];
      lower.push([a, b]);
      g.add(box(0.1, 0.03, 0.1, 'stone', { at: a }));
      g.add(beam(a, b, 0.065, 'iron'));
    }
  }
  braces(g, lower, 0.45, 0.85);

  // The big arches between the legs, one per side.
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const r = 0.2;
    g.add(
      arch(0.4, 0.11, 0.014, 'iron', {
        opening: 0.86,
        at: [Math.sin(yaw) * -r, 0.1, Math.cos(yaw) * -r],
        rot: [0, yaw, 0],
      }),
    );
  }

  // First platform with a gold trim.
  g.add(box(0.3, 0.035, 0.3, 'iron', { at: [0, h1, 0] }));
  g.add(box(0.31, 0.01, 0.31, 'gold', { at: [0, h1 + 0.035, 0] }));

  // Middle section up to the second platform.
  const h2 = 0.6;
  const top2 = 0.045;
  const middle: [Vec3Like, Vec3Like][] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a: Vec3Like = [sx * (top1 - 0.02), h1 + 0.045, sz * (top1 - 0.02)];
      const b: Vec3Like = [sx * top2, h2, sz * top2];
      middle.push([a, b]);
      g.add(beam(a, b, 0.04, 'iron'));
    }
  }
  braces(g, middle, 0.1, 0.55);
  braces(g, middle, 0.55, 0.95);
  g.add(box(0.15, 0.025, 0.15, 'iron', { at: [0, h2, 0] }));
  g.add(box(0.155, 0.008, 0.155, 'gold', { at: [0, h2 + 0.025, 0] }));

  // Top section: a slim square taper, the cabin, and the spire.
  g.add(
    cyl(0.022, 0.06, 0.27, 'iron', {
      segments: 4,
      rot: [0, Math.PI / 4, 0],
      at: [0, h2 + 0.03, 0],
    }),
  );
  g.add(box(0.055, 0.035, 0.055, 'iron', { at: [0, 0.9, 0] }));
  g.add(box(0.06, 0.008, 0.06, 'gold', { at: [0, 0.935, 0] }));
  g.add(cone(0.014, 0.075, 'iron', { segments: 6, at: [0, 0.943, 0] }));
}
