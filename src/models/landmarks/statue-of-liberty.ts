/**
 * Statue of Liberty: island lawn ringed by water, the star-shaped fort, the tall pedestal,
 * and the verdigris statue — robe, head with a spiky crown, torch held high, tablet.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, beam, box, cone, cyl, extrude, lathe, sphere } from '../kit';

export default function build(g: Group): void {
  g.add(base(0.5, 'water'));
  const y0 = BASE_HEIGHT * 2;
  g.add(base(0.4, 'grass', { at: [0, BASE_HEIGHT, 0] }));

  // Eleven-pointed star fort, extruded upward.
  const star: [number, number][] = [];
  const points = 11;
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.3 : 0.2;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  g.add(extrude(star, 0.05, 'stone', { rot: [-Math.PI / 2, 0, 0], at: [0, y0 + 0.025, 0] }));

  // Pedestal: a square taper with a cornice.
  const p0 = y0 + 0.05;
  g.add(cyl(0.1, 0.13, 0.24, 'stone', { segments: 4, rot: [0, Math.PI / 4, 0], at: [0, p0, 0] }));
  g.add(box(0.17, 0.02, 0.17, 'cream', { at: [0, p0 + 0.24, 0] }));
  g.add(box(0.12, 0.03, 0.12, 'stone', { at: [0, p0 + 0.26, 0] }));

  // The statue, facing −Z.
  const s0 = p0 + 0.29;
  g.add(
    lathe(
      [
        [0.07, 0],
        [0.068, 0.04],
        [0.058, 0.16],
        [0.05, 0.24],
        [0.04, 0.29],
        [0.022, 0.31],
        [0, 0.315],
      ],
      'copper',
      { segments: 10, at: [0, s0, 0] },
    ),
  );
  // A sash across the robe.
  g.add(beam([-0.05, s0 + 0.16, -0.035], [0.045, s0 + 0.26, -0.03], 0.02, 'copperDark', 0.012));
  const neck = s0 + 0.31;
  g.add(sphere(0.034, 'copper', { lowSeg: 8, at: [0, neck + 0.028, 0] }));
  // Crown: a band and seven rays fanning out.
  g.add(cyl(0.036, 0.036, 0.012, 'copperDark', { segments: 10, at: [0, neck + 0.04, 0] }));
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i - 3) / 3) * 1.1; // spread around the front
    const tilt = 0.9;
    g.add(
      cone(0.008, 0.045, 'copper', {
        segments: 4,
        at: [Math.cos(a) * 0.034, neck + 0.048, Math.sin(a) * 0.034],
        rot: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt],
      }),
    );
  }

  // Right arm raised with the torch.
  const shoulderR: [number, number, number] = [0.04, s0 + 0.27, 0];
  const hand: [number, number, number] = [0.075, s0 + 0.47, 0];
  g.add(beam(shoulderR, hand, 0.026, 'copper'));
  g.add(cyl(0.012, 0.009, 0.04, 'copperDark', { segments: 6, at: hand }));
  g.add(cyl(0.022, 0.012, 0.022, 'gold', { segments: 8, at: [hand[0], hand[1] + 0.04, 0] }));
  g.add(cone(0.018, 0.055, 'flame', { segments: 6, at: [hand[0], hand[1] + 0.06, 0] }));

  // Left arm holding the tablet.
  const shoulderL: [number, number, number] = [-0.042, s0 + 0.26, 0];
  const elbow: [number, number, number] = [-0.062, s0 + 0.17, -0.03];
  g.add(beam(shoulderL, elbow, 0.024, 'copper'));
  g.add(
    box(0.045, 0.075, 0.014, 'copperDark', {
      at: [-0.07, s0 + 0.12, -0.042],
      rot: [0.15, 0, 0.25],
    }),
  );
}
