/**
 * Mount Fuji: a lathe volcano with gently concave slopes and a crater, a forest skirt,
 * a snow cap with a zig-zag edge, trees around the foot and a red torii gate in front.
 */
import type { Group, Mesh } from 'three';
import { BASE_HEIGHT, base, beam, cone, cyl, lathe } from '../kit';

/** The mountain's profile `[radius, y]`, foot to crater rim. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.78, 0],
  [0.62, 0.1],
  [0.46, 0.25],
  [0.32, 0.46],
  [0.21, 0.67],
  [0.13, 0.84],
  [0.105, 0.9],
];

/** Mountain radius at height y (linear between profile points). */
function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1]!;
    const [r1, y1] = PROFILE[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return PROFILE[PROFILE.length - 1]![0];
}

/** A band of the slope from y = a to y = b, pushed out by `off`. */
function band(a: number, b: number, off: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const y = a + ((b - a) * i) / steps;
    out.push([radiusAt(y) + off, y]);
  }
  return out;
}

/** Zig-zags the lower edge of a lathe: every other column drops by `drop` along the slope. */
function zigzag(mesh: Mesh, bottomY: number, drop: number): void {
  const pos = mesh.geometry.getAttribute('position');
  const rows = pos.count; // LatheGeometry: columns × profile points, column-major
  const perColumn = 4 + 1; // band(…, 4) has 5 points
  for (let i = 0; i < rows; i += perColumn) {
    const column = i / perColumn;
    if (column % 2 === 1) continue;
    const y = pos.getY(i);
    if (Math.abs(y - bottomY) > 1e-6) continue;
    const ny = y - drop;
    const r = radiusAt(ny) + 0.008;
    const len = Math.hypot(pos.getX(i), pos.getZ(i)) || 1;
    pos.setXYZ(i, (pos.getX(i) / len) * r, ny, (pos.getZ(i) / len) * r);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.98));
  const at = [0, y0, 0] as const;
  g.add(lathe([...PROFILE, [0.07, 0.87], [0, 0.85]], 'slate', { segments: 12, at }));
  // Forest skirt around the lower slopes.
  g.add(lathe(band(0, 0.16, 0.008, 3), 'leafDark', { segments: 12, at }));
  // Snow cap, rim and crater.
  const snowBottom = 0.58;
  const snow = lathe([...band(snowBottom, 0.9, 0.008, 4), [0.075, 0.875], [0, 0.855]], 'snow', {
    segments: 12,
    at,
  });
  zigzag(snow, snowBottom, 0.09);
  g.add(snow);

  // Trees ringing the foot.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const r = 0.86 + (i % 3) * 0.03;
    if (Math.abs(Math.sin(a) + 1) < 0.15) continue; // keep the front (−Z) clear for the gate
    g.add(
      cone(0.04, 0.1 + (i % 2) * 0.03, 'leaf', {
        segments: 6,
        at: [Math.cos(a) * r, y0, Math.sin(a) * r],
      }),
    );
  }

  // A red torii gate in front of the mountain.
  const tz = -0.88;
  for (const x of [-0.04, 0.04])
    g.add(cyl(0.008, 0.008, 0.09, 'roofRed', { segments: 6, at: [x, y0, tz] }));
  g.add(beam([-0.065, y0 + 0.095, tz], [0.065, y0 + 0.095, tz], 0.014, 'roofRed', 0.012));
  g.add(beam([-0.055, y0 + 0.07, tz], [0.055, y0 + 0.07, tz], 0.01, 'roofRed', 0.008));
  g.add(beam([-0.07, y0 + 0.106, tz], [0.07, y0 + 0.106, tz], 0.016, 'ink', 0.006));
}
