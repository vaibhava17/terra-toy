/**
 * Sydney Opera House: two rows of nested white shells (rounded half lathes leaning north,
 * each tucked into the next) with glass in their mouths, on a sandstone podium with broad
 * steps, on a stone quay rising out of the harbour.
 */
import { Group } from 'three';
import { base, box, extrude, lathe, place, stairs } from '../kit';

/** Shell profile `[radius, y]`, normalised to radius 1 and height 1: a rounded dome. */
const SHELL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.97, 0.22],
  [0.88, 0.45],
  [0.72, 0.66],
  [0.5, 0.83],
  [0.25, 0.95],
  [0, 1],
];

/**
 * One shell, base radius r and height h: its curved back toward +Z (south), its open
 * mouth (glazed) toward −Z, tipped back by `lean` so the crown hangs over the mouth.
 */
function shell(r: number, h: number, x: number, y: number, z: number, lean = 0.5): Group {
  const s = new Group();
  const profile = SHELL.map(([pr, py]): [number, number] => [pr * r, py * h]);
  s.add(lathe(profile, 'tile', { segments: 10, phiStart: -Math.PI / 2, phiLength: Math.PI }));
  // Glass curtain filling the mouth (the shell's flat side, at z = 0), set back a little.
  const outline: [number, number][] = [
    ...SHELL.map(([pr, py]): [number, number] => [pr * r * 0.96, py * h * 0.96]),
    ...SHELL.slice(0, -1)
      .reverse()
      .map(([pr, py]): [number, number] => [-pr * r * 0.96, py * h * 0.96]),
  ];
  s.add(extrude(outline, 0.006, 'glass', { at: [0, 0, 0.012] }));
  return place(s, { at: [x, y, z], rot: [-lean, 0, 0], scale: [0.85, 1, 1] });
}

export default function build(g: Group): void {
  g.add(base(0.6, 'water'));
  // Bennelong Point: a stone quay standing in the water, with the shore lawn to the south.
  const quayH = 0.035;
  g.add(box(0.72, quayH, 0.86, 'stone', { at: [0, 0, 0.02] }));
  g.add(box(0.6, 0.01, 0.12, 'grass', { at: [0, quayH, 0.38] }));
  // The podium and its broad steps (facing south, toward the city).
  const podH = 0.07;
  g.add(box(0.66, podH, 0.6, 'sandstone', { at: [0, quayH, -0.08] }));
  g.add(stairs(5, 0.36, podH, 0.1, 'sandstone', { at: [0, quayH, 0.27], rot: [0, Math.PI, 0] }));
  const top = quayH + podH;

  // Western row (the big hall) and eastern row (the smaller hall): nested shells, the
  // biggest to the north, each smaller one tucked into the back of the one before.
  const rows: ReadonlyArray<readonly [number, number]> = [
    [-0.15, 1],
    [0.16, 0.82],
  ];
  for (const [x, k] of rows) {
    g.add(shell(0.17 * k, 0.4 * k, x, top, -0.26));
    g.add(shell(0.15 * k, 0.33 * k, x, top, -0.15));
    g.add(shell(0.125 * k, 0.25 * k, x, top, -0.05));
    // The back shell faces the other way (south).
    const back = new Group().add(shell(0.1 * k, 0.17 * k, 0, 0, 0, 0.45));
    g.add(place(back, { at: [x, top, 0.12], rot: [0, Math.PI, 0] }));
  }
  // The small restaurant shells on the south-west corner.
  g.add(shell(0.07, 0.14, -0.24, top, 0.13));
  g.add(shell(0.055, 0.1, -0.24, top, 0.19));
}
