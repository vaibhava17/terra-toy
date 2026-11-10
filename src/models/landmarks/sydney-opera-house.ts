/**
 * Sydney Opera House: two rows of white tiled sails (half lathes, narrowed and leaning
 * north) with glass in their mouths, on a sandstone podium with steps, on the harbour.
 */
import { Group } from 'three';
import { BASE_HEIGHT, base, box, extrude, lathe, place, stairs } from '../kit';

/** Sail profile `[radius, y]`, normalised to radius 1 and height 1. */
const SAIL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.97, 0.2],
  [0.86, 0.42],
  [0.66, 0.64],
  [0.38, 0.84],
  [0, 1],
];

/** One sail: open toward −Z, curved shell toward +Z, its tip leaning north. */
function sail(r: number, h: number, x: number, y: number, z: number, lean = 0.42): Group {
  const s = new Group();
  const profile = SAIL.map(([pr, py]): [number, number] => [pr * r, py * h]);
  s.add(lathe(profile, 'tile', { segments: 8, phiStart: -Math.PI / 2, phiLength: Math.PI }));
  // Glass curtain filling the mouth (the shell's flat side, at z = 0).
  const outline: [number, number][] = [
    ...SAIL.map(([pr, py]): [number, number] => [pr * r * 0.97, py * h * 0.97]),
    ...SAIL.slice(0, -1)
      .reverse()
      .map(([pr, py]): [number, number] => [-pr * r * 0.97, py * h * 0.97]),
  ];
  s.add(extrude(outline, 0.006, 'glass', { at: [0, 0, 0.006] }));
  return place(s, { at: [x, y, z], rot: [-lean, 0, 0], scale: [0.62, 1, 1] });
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.75, 'water'));
  // Bennelong Point: a stone quay running south to the shore lawn.
  g.add(box(0.36, 0.03, 0.35, 'stone', { at: [0, y0, 0.32] }));
  g.add(box(0.55, 0.012, 0.18, 'grass', { at: [0, y0, 0.58] }));
  // The podium and its broad steps (facing south, toward the city).
  const podH = 0.08;
  g.add(box(0.62, podH, 0.62, 'sandstone', { at: [0, y0, -0.06] }));
  g.add(stairs(5, 0.34, podH, 0.1, 'sandstone', { at: [0, y0, 0.3], rot: [0, Math.PI, 0] }));
  const top = y0 + podH;

  // Western row (the big hall) and eastern row (the smaller hall), biggest to the north.
  const rows: ReadonlyArray<readonly [number, number]> = [
    [-0.12, 1],
    [0.15, 0.82],
  ];
  for (const [x, k] of rows) {
    g.add(sail(0.17 * k, 0.6 * k, x, top, -0.2));
    g.add(sail(0.15 * k, 0.48 * k, x, top, -0.05));
    g.add(sail(0.12 * k, 0.34 * k, x, top, 0.08));
    // The back sail faces the other way.
    g.add(sail(0.1 * k, 0.24 * k, x, top, 0.16, -0.5));
  }
  // The small restaurant sails on the south-west corner.
  g.add(sail(0.07, 0.17, -0.22, top, 0.2));
  g.add(sail(0.055, 0.12, -0.22, top, 0.25));
}
