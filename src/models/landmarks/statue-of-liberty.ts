/**
 * Statue of Liberty: a small island lawn ringed by water, the star-shaped fort, the tall
 * stepped pedestal, and the verdigris statue — robe, head with a spiky crown, torch held
 * high, tablet. Drawn slim and tall so the figure reads from the tilted view.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, beam, box, cone, cyl, extrude, lathe, sphere } from '../kit';

export default function build(g: Group): void {
  g.add(base(0.34, 'water'));
  const y0 = BASE_HEIGHT * 2;
  g.add(base(0.28, 'grass', { at: [0, BASE_HEIGHT, 0] }));

  // Eleven-pointed star fort, extruded upward (a solid, closed prism).
  const star: [number, number][] = [];
  const points = 11;
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.22 : 0.15;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const fortH = 0.04;
  g.add(extrude(star, fortH, 'stone', { rot: [-Math.PI / 2, 0, 0], at: [0, y0 + fortH / 2, 0] }));

  // Pedestal: a stepped plinth, a tall square shaft, a cornice and a top block (all solid
  // boxes, so the top is a closed, lit face).
  const p0 = y0 + fortH;
  g.add(box(0.15, 0.04, 0.15, 'stone', { at: [0, p0, 0] }));
  g.add(box(0.11, 0.26, 0.11, 'stone', { at: [0, p0 + 0.04, 0] }));
  g.add(box(0.13, 0.02, 0.13, 'cream', { at: [0, p0 + 0.3, 0] }));
  g.add(box(0.095, 0.03, 0.095, 'stone', { at: [0, p0 + 0.32, 0] }));

  // The statue, facing +Z (toward the viewer from the harbour).
  const s0 = p0 + 0.35;
  g.add(
    lathe(
      [
        [0.05, 0],
        [0.05, 0.04],
        [0.044, 0.2],
        [0.038, 0.32],
        [0.032, 0.38],
        [0.016, 0.405],
        [0, 0.41],
      ],
      'copper',
      { segments: 10, at: [0, s0, 0] },
    ),
  );
  // A sash across the robe.
  g.add(beam([-0.04, s0 + 0.22, 0.03], [0.036, s0 + 0.34, 0.026], 0.016, 'copperDark', 0.012));
  const neck = s0 + 0.4;
  g.add(sphere(0.03, 'copper', { lowSeg: 8, at: [0, neck + 0.025, 0] }));
  // Crown: a band and seven rays fanning out.
  g.add(cyl(0.032, 0.032, 0.012, 'copperDark', { segments: 10, at: [0, neck + 0.035, 0] }));
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + ((i - 3) / 3) * 1.1; // spread around the front (+Z)
    const tilt = 0.9;
    g.add(
      cone(0.008, 0.045, 'copper', {
        segments: 4,
        at: [Math.cos(a) * 0.03, neck + 0.043, Math.sin(a) * 0.03],
        rot: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt],
      }),
    );
  }

  // Her right arm (on the viewer's left, −X) raised with the torch.
  const shoulderR: [number, number, number] = [-0.032, s0 + 0.36, 0];
  const hand: [number, number, number] = [-0.06, s0 + 0.56, 0];
  g.add(beam(shoulderR, hand, 0.024, 'copper'));
  g.add(cyl(0.011, 0.008, 0.04, 'copperDark', { segments: 6, at: hand }));
  g.add(cyl(0.022, 0.012, 0.022, 'gold', { segments: 8, at: [hand[0], hand[1] + 0.04, 0] }));
  g.add(cone(0.018, 0.055, 'flame', { segments: 6, at: [hand[0], hand[1] + 0.06, 0] }));

  // Left arm holding the tablet against the side.
  const shoulderL: [number, number, number] = [0.034, s0 + 0.35, 0];
  const elbow: [number, number, number] = [0.052, s0 + 0.25, 0.026];
  g.add(beam(shoulderL, elbow, 0.022, 'copper'));
  g.add(
    box(0.04, 0.075, 0.014, 'copperDark', {
      at: [0.058, s0 + 0.19, 0.036],
      rot: [-0.15, 0, -0.25],
    }),
  );
}
