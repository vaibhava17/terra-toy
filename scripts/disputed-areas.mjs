// Builds src/engine/globe/disputed-areas.json from Natural Earth's 1:10m
// "admin 0 disputed areas" (public domain), keeping every area the file flags
// except the whole territories listed in WHOLE_TERRITORIES below.
//
//   curl -sSfLo /tmp/ne.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_disputed_areas.geojson
//   node scripts/disputed-areas.mjs /tmp/ne.geojson src/engine/globe/disputed-areas.json
//   npx prettier --write src/engine/globe/disputed-areas.json
//
// Each MultiPolygon is split into plain Polygons (disputed.ts takes Polygons, and a
// small box per island keeps picking fast). Coordinates are rounded to 0.001°;
// a ring that rounding would collapse keeps 0.00001° instead. Ring order and winding
// are kept as Natural Earth has them (clockwise outer rings, as d3-geo expects).
import { readFileSync, writeFileSync } from 'node:fs';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error(
    'usage: node scripts/disputed-areas.mjs <ne_10m_admin_0_disputed_areas.geojson> <out.json>',
  );
  process.exit(2);
}

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

const fc = JSON.parse(readFileSync(src, 'utf8'));
const features = [];
const excluded = new Set();
for (const f of fc.features) {
  const p = f.properties;
  const name = clean(p.BRK_NAME) || clean(p.NAME);
  if (WHOLE_TERRITORIES.has(name)) {
    excluded.add(name);
    continue;
  }
  const note = clean(p.NOTE_BRK);
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const poly of polys) {
    features.push({
      type: 'Feature',
      properties: note ? { name, note } : { name },
      geometry: { type: 'Polygon', coordinates: poly.map(ring) },
    });
  }
}
const missing = [...WHOLE_TERRITORIES].filter((n) => !excluded.has(n));
if (missing.length) throw new Error(`excluded names not in the source: ${missing.join(', ')}`);
features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'en'));
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(
  `${fc.features.length} Natural Earth areas, ${excluded.size} whole territories left out -> ${features.length} polygons`,
);
