/**
 * Mount Fuji: a lathe volcano with gently concave blue-grey slopes, a forest skirt and a
 * snow cap, trees around the foot and a red torii gate in front.
 *
 * The forest and the snow follow the SAME profile as the mountain (same axis, same
 * columns). The rock ends at the snow line and the snow cap carries on up the slope, so
 * there is no seam; where they overlap (the forest, the snow's jagged edge) the skin is
 * pushed out by a few % of the radius, so nothing z-fights.
 */
import type { Group, Mesh } from 'three';
import { BASE_HEIGHT, base, beam, cone, cyl, lathe } from '../kit';

/** The mountain's profile `[radius, y]`, foot to the flat summit. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.74, 0],
  [0.6, 0.09],
  [0.45, 0.22],
  [0.32, 0.4],
  [0.22, 0.58],
  [0.16, 0.72],
  [0.125, 0.82],
  [0.11, 0.86],
];
const SUMMIT = 0.87;
const SEGMENTS = 12;

/** Mountain radius at height y (linear between profile points). */
function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1]!;
    const [r1, y1] = PROFILE[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return PROFILE[PROFILE.length - 1]![0];
}

/** The slope from y = a to y = b (`steps` rows), scaled out by `1 + grow`. */
function band(a: number, b: number, grow: number, steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const y = a + ((b - a) * i) / steps;
    out.push([radiusAt(y) * (1 + grow), y]);
  }
  return out;
}

/**
 * Zig-zags a skin's lower edge: on every other column the bottom vertex slides `drop`
 * down the slope (staying on the scaled profile), so the snow line is jagged.
 */
function zigzag(mesh: Mesh, rows: number, bottomY: number, drop: number, grow: number): void {
  const pos = mesh.geometry.getAttribute('position');
  for (let i = 0, column = 0; i < pos.count; i += rows, column++) {
    if (column % 2 === 1) continue;
    const ny = bottomY - drop;
    const r = radiusAt(ny) * (1 + grow);
    const len = Math.hypot(pos.getX(i), pos.getZ(i)) || 1;
    pos.setXYZ(i, (pos.getX(i) / len) * r, ny, (pos.getZ(i) / len) * r);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export default function build(g: Group): void {
  const y0 = BASE_HEIGHT;
  g.add(base(0.86));
  const at = [0, y0, 0] as const;
  const opts = { segments: SEGMENTS, at };
  // The rock stops at the snow line, so above it there is nothing for the snow to fight.
  const grow = 0.03;
  const snowLine = 0.58;
  const steps = 5;
  g.add(
    lathe(
      [...PROFILE.filter(([, y]) => y < snowLine), [radiusAt(snowLine), snowLine], [0, snowLine]],
      'volcano',
      opts,
    ),
  );
  // Forest skirt on the lower slopes.
  g.add(lathe(band(0, 0.14, 0.012, 3), 'leafDark', opts));
  // Snow cap: the upper slope and the summit, on the same profile (3 % proud where its
  // jagged lower edge overlaps the rock).
  const snowProfile = band(snowLine, PROFILE[PROFILE.length - 1]![1], grow, steps);
  const snow = lathe([...snowProfile, [0, SUMMIT + 0.008]], 'snow', opts);
  zigzag(snow, steps + 2, snowLine, 0.1, grow);
  g.add(snow);

  // Trees ringing the foot, leaving the front (+Z, toward the viewer) open for the gate.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.sin(a) - 1) < 0.2) continue;
    const r = 0.76 + (i % 3) * 0.025;
    g.add(
      cone(0.04, 0.1 + (i % 2) * 0.03, 'leaf', {
        segments: 6,
        at: [Math.cos(a) * r, y0, Math.sin(a) * r],
      }),
    );
  }

  // A red torii gate at the foot, in front of the mountain.
  const tz = 0.79;
  for (const x of [-0.045, 0.045])
    g.add(cyl(0.009, 0.009, 0.1, 'roofRed', { segments: 6, at: [x, y0, tz] }));
  g.add(beam([-0.07, y0 + 0.104, tz], [0.07, y0 + 0.104, tz], 0.016, 'roofRed', 0.014));
  g.add(beam([-0.058, y0 + 0.078, tz], [0.058, y0 + 0.078, tz], 0.01, 'roofRed', 0.008));
}
