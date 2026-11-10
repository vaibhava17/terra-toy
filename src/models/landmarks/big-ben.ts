/**
 * Big Ben (the Elizabeth Tower): a tall sandstone shaft, the clock stage with four gold-
 * rimmed faces, the belfry and a slate spire with a gold tip, on a small stone terrace.
 */
import type { Group } from 'three';
import { BASE_HEIGHT, base, box, cone, cyl } from '../kit';

/**
 * A clock face on the side facing `yaw` (0 = −Z) of a tower whose axis is at (cx, cz),
 * `d` out from the axis, centred at height y.
 */
function clock(g: Group, cx: number, cz: number, yaw: number, d: number, y: number): void {
  const sx = -Math.sin(yaw);
  const sz = -Math.cos(yaw);
  const at = (out: number) => [cx + sx * (d + out), y, cz + sz * (d + out)] as const;
  // A disc stands along +Y; tipping it by −π/2 about X points it along −Z, then the yaw.
  const rot = [-Math.PI / 2, yaw, 0] as const;
  g.add(cyl(0.064, 0.064, 0.008, 'gold', { segments: 12, at: at(0), rot }));
  g.add(cyl(0.055, 0.055, 0.012, 'clockFace', { segments: 12, at: at(0), rot }));
  // Hands at ten past ten, turning in the face's plane.
  const hand = (len: number, angle: number) =>
    box(0.007, len, 0.004, 'ink', { at: at(0.013), rot: [0, yaw, angle] });
  g.add(hand(0.042, 0.95), hand(0.03, -0.55));
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.22));
  // A low terrace of Westminster stone around the tower's foot.
  g.add(box(0.24, 0.02, 0.24, 'stone', { at: [0, y0, 0] }));
  // Tower shaft with stone bands.
  const w = 0.15;
  const shaftH = 0.55;
  g.add(box(w, shaftH, w, 'sandstone', { at: [0, y0, 0] }));
  for (const h of [0.18, 0.36, 0.52])
    g.add(box(w + 0.012, 0.012, w + 0.012, 'cream', { at: [0, y0 + h, 0] }));
  // Clock stage.
  const c0 = y0 + shaftH;
  const cw = 0.19;
  g.add(box(cw, 0.15, cw, 'sandstone', { at: [0, c0, 0] }));
  g.add(box(cw + 0.014, 0.014, cw + 0.014, 'gold', { at: [0, c0 + 0.15, 0] }));
  for (let i = 0; i < 4; i++) clock(g, 0, 0, (i * Math.PI) / 2, cw / 2, c0 + 0.075);
  // Belfry, spire and gold tip.
  const b0 = c0 + 0.164;
  g.add(box(0.15, 0.08, 0.15, 'cream', { at: [0, b0, 0] }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(
        cone(0.014, 0.07, 'gold', {
          segments: 4,
          at: [sx * 0.085, c0 + 0.164, sz * 0.085],
        }),
      );
    }
  }
  g.add(
    cone(0.11, 0.17, 'slate', {
      segments: 4,
      rot: [0, Math.PI / 4, 0],
      at: [0, b0 + 0.08, 0],
    }),
  );
  g.add(cyl(0.006, 0.01, 0.04, 'gold', { segments: 4, at: [0, b0 + 0.235, 0] }));
  g.add(cone(0.01, 0.04, 'gold', { segments: 4, at: [0, b0 + 0.27, 0] }));
}
