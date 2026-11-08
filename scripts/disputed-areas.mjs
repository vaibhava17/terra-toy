// Builds src/engine/globe/disputed-areas.json from Natural Earth's 1:10m
// "admin 0 disputed areas" and 1:10m land (both public domain), pinned to v5.1.2:
//
//   NE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson
//   curl -sSfLo /tmp/ne-disputed.geojson $NE/ne_10m_admin_0_disputed_areas.geojson
//   curl -sSfLo /tmp/ne-land.geojson $NE/ne_10m_land.geojson
//   node scripts/disputed-areas.mjs /tmp/ne-disputed.geojson /tmp/ne-land.geojson \
//     src/engine/globe/disputed-areas.json
//   npx prettier --write src/engine/globe/disputed-areas.json
//
// Which areas: TYPE Disputed, Breakaway or Indeterminate always; TYPE Lease, Overlay,
// Geo subunit or Geo unit only when NOTE_BRK says "Claimed by" (see NOT_DISPUTES). The
// whole territories in WHOLE_TERRITORIES are left out too.
//
// Two kinds of feature, both plain Polygons (disputed.ts takes Polygons, and a small box
// per island keeps picking fast):
//
// - core  { name }: the Natural Earth area itself. Coordinates rounded to 0.001°; a ring
//   that rounding would collapse keeps 0.00001° instead. Ring order and winding as Natural
//   Earth has them (clockwise outer rings, as d3-geo expects).
// - coast { name, coast: [world-atlas names] }: the globe picks countries from world-atlas
//   110m/50m, whose coastlines sit further out to sea than the 10m ones, so a tap on the
//   land you see near the shore can miss the core. The fringe is the sea within
//   COAST_KM of the area and nearer to it than to any other land (buffer(area) minus 10m
//   land, minus buffer(other land) at the same distance, in COAST_RINGS steps), so it
//   never covers a neighbour's real land or the sea on its side of a strait. The area
//   itself is unioned back in so simplifying (Douglas–Peucker, then a COAST_STEP grid)
//   cannot open a gap along the coast; the core is checked first anyway. It counts only
//   where world-atlas tags the point with one of the `coast` names, the countries
//   world-atlas puts the area's core in (sampled here at 110m and 50m): open sea, and a
//   neighbour's own coastal slop, stay as they were. Areas with no sea nearby, or that
//   world-atlas does not draw as land, get no fringe. The run stops if a fringe would
//   cross 180° (none does: Matthew and Hunter Is. get none, the Kurils stop at ~150°E).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import buffer from '@turf/buffer';
import { geoBounds, geoContains } from 'd3-geo';
import polygonClipping from 'polygon-clipping';
import { feature as topoFeature } from 'topojson-client';

const [src, landSrc, out] = process.argv.slice(2);
if (!src || !landSrc || !out) {
  console.error(
    'usage: node scripts/disputed-areas.mjs <ne_10m_admin_0_disputed_areas.geojson> <ne_10m_land.geojson> <out.json>',
  );
  process.exit(2);
}

const COAST_KM = 20;
const COAST_STEP = 0.01;

const roundRing = (ring, step) => {
  const r = [];
  for (const [x, y] of ring) {
    const p = [Math.round(x / step) * step, Math.round(y / step) * step].map(
      (v) => +v.toFixed(Math.round(-Math.log10(step))),
    );
    const last = r[r.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) r.push(p);
  }
  return r;
};

// At least 3 distinct corners plus the closing point.
const usable = (ring) => ring.length >= 4 && new Set(ring.map((p) => p.join())).size >= 3;

const ring = (raw) => {
  for (const step of [0.001, 0.00001]) {
    const r = roundRing(raw, step);
    if (usable(r)) return r;
  }
  throw new Error('ring collapses even at 0.00001°');
};

const clean = (s) =>
  String(s ?? '')
    .replace(/\uFEFF/g, '')
    .trim();

// Natural Earth also flags some whole countries/territories, not just border strips.
// Those keep their normal country name (Vaibhav, 09 Nov), so they are left out here.
// Natural Earth names; the run fails if one of them is no longer in the file.
const WHOLE_TERRITORIES = new Set([
  'Belize',
  'Gaza',
  'Israel',
  'Kosovo',
  'North Borneo', // Sabah
  'Somaliland',
  'Taiwan',
  'West Bank',
]);

// Always disputes. Natural Earth's other TYPEs (Lease, Overlay, Geo subunit, Geo unit)
// count only when NOTE_BRK names a claimant.
const DISPUTE_TYPES = new Set(['Disputed', 'Breakaway', 'Indeterminate']);
// What that rule drops from v5.1.2 (leases, buffer zones, undisputed subunits); the run
// fails if the dropped list changes, so a new Natural Earth release gets a look.
const NOT_DISPUTES = new Set([
  'Baykonur', // leased to Russia by Kazakhstan
  'Ceuta', // Spain
  'Korean Demilitarized Zone (north)',
  'Korean Demilitarized Zone (south)',
  'Korean islands under UN jurisdiction',
  'Melilla', // Spain
  'UNDOF Zone', // UN-patrolled zone in Syria
]);
const isDispute = (p) => DISPUTE_TYPES.has(clean(p.TYPE)) || /claimed by/i.test(clean(p.NOTE_BRK));

// --- world-atlas: which country names it gives each area's core ---------------------
const require = createRequire(import.meta.url);
const atlas = ['110m', '50m'].map((level) => {
  const topo = require(`world-atlas/countries-${level}.json`);
  return topoFeature(topo, topo.objects.countries).features.map((f) => {
    const [[w, s], [e, n]] = geoBounds(f);
    return { name: f.properties.name, f, w, s, e, n };
  });
});
const inBox = (b, lng, lat) =>
  lat >= b.s && lat <= b.n && (b.w <= b.e ? lng >= b.w && lng <= b.e : lng >= b.w || lng <= b.e);
const atlasName = (countries, lng, lat) =>
  countries.find((c) => inBox(c, lng, lat) && geoContains(c.f, [lng, lat]))?.name ?? null;

// A name counts if world-atlas gives it to at least this share of the core's land samples
// at that level (a coarse border can nick a corner of a neighbour).
const ADMIN_SHARE = 0.2;

function coastNames(polys) {
  const g = { type: 'MultiPolygon', coordinates: polys };
  const [[w, s], [e, n]] = geoBounds(g);
  const width = e >= w ? e - w : e + 360 - w;
  const step = Math.max(Math.sqrt((width * (n - s)) / 4000), 0.002);
  const pts = [];
  for (let lat = s + step / 2; lat < n; lat += step)
    for (let x = w + step / 2; x < w + width; x += step) {
      const lng = x > 180 ? x - 360 : x;
      if (geoContains(g, [lng, lat])) pts.push([lng, lat]);
    }
  // Areas too small for the grid: sample their outer-ring vertices instead.
  if (!pts.length) for (const poly of polys) pts.push(...poly[0]);
  const names = new Set();
  for (const countries of atlas) {
    const counts = new Map();
    let hits = 0;
    for (const [lng, lat] of pts) {
      const name = atlasName(countries, lng, lat);
      if (!name) continue;
      hits++;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const [name, c] of counts) if (c >= ADMIN_SHARE * hits) names.add(name);
  }
  return [...names].sort();
}

/** Planar box of the outer rings of polygons (none here crosses 180°). */
function bboxOf(multi) {
  const box = { w: Infinity, s: Infinity, e: -Infinity, n: -Infinity };
  for (const poly of multi)
    for (const [x, y] of poly[0]) {
      box.w = Math.min(box.w, x);
      box.e = Math.max(box.e, x);
      box.s = Math.min(box.s, y);
      box.n = Math.max(box.n, y);
    }
  return box;
}

// --- 10m land, one entry per polygon with its box ---------------------------------
const landPolys = [];
for (const f of JSON.parse(readFileSync(landSrc, 'utf8')).features) {
  const g = f.geometry;
  for (const poly of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) {
    landPolys.push({ poly, ...bboxOf([poly]) });
  }
}

const rect = ({ w, s, e, n }) => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];

// Area of a planar ring (degrees²), positive when counterclockwise.
const signedArea = (r) => {
  let a = 0;
  for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
};

/** Douglas–Peucker on a closed ring (planar degrees); keeps the first vertex. */
const simplify = (closed, tol) => {
  const keep = new Uint8Array(closed.length);
  keep[0] = keep[closed.length - 1] = 1;
  const stack = [[0, closed.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = closed[i];
    const [bx, by] = closed[j];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1;
    let at = -1;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = closed[k];
      const d = len
        ? Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
        : Math.hypot(px - ax, py - ay);
      if (d > worst) {
        worst = d;
        at = k;
      }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([i, at], [at, j]);
    }
  }
  return closed.filter((_, k) => keep[k]);
};

/** Drops collinear vertices, including zero-width spikes, from a closed ring. */
const despike = (closed) => {
  const r = closed.slice(0, -1);
  for (let changed = true; changed && r.length >= 3;) {
    changed = false;
    for (let i = 0; i < r.length && r.length >= 3; i++) {
      const a = r[(i + r.length - 1) % r.length];
      const b = r[i];
      const c = r[(i + 1) % r.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) < 1e-10) {
        r.splice(i--, 1);
        changed = true;
      }
    }
  }
  return r.length >= 3 ? [...r, r[0]] : [];
};

const bufferPolys = (multi, km) => {
  if (!multi.length) return [];
  const g = buffer({ type: 'MultiPolygon', coordinates: multi }, km, {
    units: 'kilometers',
  })?.geometry;
  if (!g) return [];
  return g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
};

/**
 * Sea within COAST_KM of the area and nearer to it than to any other land (planar lon/lat;
 * no area here crosses 180°). "Nearer" is approximated with buffers every COAST_KM /
 * COAST_RINGS km: the sea within d of the area but not within d of other land.
 */
const COAST_RINGS = 8;
function coastFringe(polys) {
  const zonePolys = bufferPolys(polys, COAST_KM);
  const box = bboxOf(zonePolys);
  if (box.e - box.w > 180) throw new Error('fringe crosses the antimeridian');
  // Other land up to COAST_KM beyond the zone still decides who is nearer; 0.3° is enough
  // (> 25 km in latitude, and in longitude up to ±60°, beyond any area with a fringe).
  const pad = 0.3 / Math.cos((Math.max(Math.abs(box.s), Math.abs(box.n)) * Math.PI) / 180);
  const near = { w: box.w - pad, s: box.s - 0.3, e: box.e + pad, n: box.n + 0.3 };
  const land = landPolys
    .filter((l) => l.e >= near.w && l.w <= near.e && l.n >= near.s && l.s <= near.n)
    .map((l) => polygonClipping.intersection(l.poly, rect(near)))
    .filter((m) => m.length);
  if (!land.length) throw new Error('no 10m land near a disputed area');
  const allLand = polygonClipping.union(...land);
  const otherLand = polygonClipping.difference(allLand, polys);
  let sea = [];
  for (let i = 1; i <= COAST_RINGS; i++) {
    const km = (COAST_KM * i) / COAST_RINGS;
    const band = polygonClipping.difference(
      bufferPolys(polys, km),
      allLand,
      polys,
      bufferPolys(otherLand, km),
    );
    if (band.length) sea = sea.length ? polygonClipping.union(sea, band) : band;
  }
  if (!sea.length) return [];
  // Add the area back, so simplifying cannot open a gap along the 10m coast (a point in
  // the core is caught by the core first anyway).
  sea = polygonClipping.union(sea, polys);
  // Snap to the COAST_STEP grid, drop slivers that collapse (zero-area rings also trip
  // polygon-clipping), and let a union repair the topology.
  const solid = (r) => usable(r) && Math.abs(signedArea(r)) >= (COAST_STEP * COAST_STEP) / 2;
  const snap = (r) => despike(roundRing(simplify(r, COAST_STEP), COAST_STEP));
  const snapped = [];
  for (const [outer, ...holes] of sea) {
    const o = snap(outer);
    if (solid(o)) snapped.push([o, ...holes.map(snap).filter(solid)]);
  }
  if (!snapped.length) return [];
  sea = polygonClipping.union(...snapped.map((p) => [p]));
  return sea
    .map((poly) => poly.map(snap).filter(solid))
    .filter((poly) => poly.length && solid(poly[0]))
    .map((poly) =>
      // polygon-clipping winds outer rings counterclockwise; d3-geo wants clockwise.
      poly.map((r) => (signedArea(r) > 0 === (r === poly[0]) ? [...r].reverse() : r)),
    );
}

// --- main ---------------------------------------------------------------------------
const fc = JSON.parse(readFileSync(src, 'utf8'));
const cores = [];
const coasts = [];
const excluded = new Set();
const dropped = new Set();
for (const f of fc.features) {
  const p = f.properties;
  const name = clean(p.BRK_NAME) || clean(p.NAME);
  if (WHOLE_TERRITORIES.has(name)) {
    excluded.add(name);
    continue;
  }
  if (!isDispute(p)) {
    dropped.add(name);
    continue;
  }
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const poly of polys) {
    cores.push({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Polygon', coordinates: poly.map(ring) },
    });
  }
  const coast = coastNames(polys);
  if (!coast.length) continue;
  let fringe;
  try {
    fringe = coastFringe(polys);
  } catch (err) {
    throw new Error(`coast fringe for ${name}`, { cause: err });
  }
  for (const poly of fringe) {
    coasts.push({
      type: 'Feature',
      properties: { name, coast },
      geometry: { type: 'Polygon', coordinates: poly },
    });
  }
  if (fringe.length) console.log(`  coast ${name}: ${fringe.length} polygons, [${coast}]`);
}
const missing = [...WHOLE_TERRITORIES].filter((n) => !excluded.has(n));
if (missing.length) throw new Error(`excluded names not in the source: ${missing.join(', ')}`);
const droppedList = [...dropped].sort();
if (droppedList.join('|') !== [...NOT_DISPUTES].sort().join('|')) {
  throw new Error(`dropped areas changed: ${droppedList.join(', ')}`);
}
const byName = (a, b) => a.properties.name.localeCompare(b.properties.name, 'en');
cores.sort(byName);
coasts.sort(byName);
const features = [...cores, ...coasts];
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
const kept = new Set(cores.map((c) => c.properties.name)).size;
console.log(
  `${fc.features.length} Natural Earth features: ${excluded.size} whole territories and ` +
    `${dropped.size} non-disputes left out (${droppedList.join(', ')}) -> ${kept} areas, ` +
    `${cores.length} core + ${coasts.length} coast polygons`,
);
