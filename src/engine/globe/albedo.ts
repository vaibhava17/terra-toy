/**
 * Runtime-generated stylised Earth textures (equirectangular, 2:1):
 * left edge = lng −180, top edge = lat +90. Painted from Natural Earth land
 * (via `world-atlas`, ISC) with d3-geo, which handles antimeridian clipping.
 *
 * Painting needs a 2D canvas; the mapping helpers are pure and unit-tested.
 */
import {
  geoEquirectangular,
  geoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from 'd3-geo';
import { feature, mesh } from 'topojson-client';

/** Flat toy palette for the globe. Every colour used to paint the Earth lives here. */
export const EARTH_PALETTE = {
  ocean: '#2f8fe0',
  shallowOuter: 'rgba(120, 205, 245, 0.35)',
  shallowInner: 'rgba(160, 225, 250, 0.7)',
  land: '#7cc35a',
  /** Land overlay colours, blended by latitude (see POLAR_TINT_STOPS). */
  noTint: 'rgba(214, 236, 196, 0)',
  tundra: 'rgba(214, 236, 196, 0.6)',
  ice: 'rgba(247, 251, 255, 1)',
  coast: '#4c8f3a',
} as const;

/** Roughness for the sea-gloss map (0 = mirror, 1 = matte). Water shines, land doesn't. */
export const EARTH_ROUGHNESS = { water: 0.35, land: 0.95 } as const;

type PaletteKey = keyof typeof EARTH_PALETTE;

/**
 * Latitude → land overlay, north to south (latitudes strictly decreasing). Land is
 * fully white above ~74°N and below ~63°S, fades through a pale tundra tint, and is
 * untouched in between. Soft gradients avoid hard straight "ice lines".
 */
export const POLAR_TINT_STOPS: ReadonlyArray<readonly [lat: number, colour: PaletteKey]> = [
  [90, 'ice'],
  [74, 'ice'],
  [67, 'tundra'],
  [58, 'noTint'],
  [-54, 'noTint'],
  [-60, 'tundra'],
  [-63, 'ice'],
  [-90, 'ice'],
];

/**
 * Textures are uploaded with three's default `flipY = true`: canvas row 0 (lat +90)
 * ends up at uv.y = 1, which is where `SphereGeometry` puts the north pole.
 */
export const TEXTURE_FLIP_Y = true;

export interface Texel {
  x: number;
  y: number;
}

/**
 * (lat, lng) in degrees → pixel coordinates in a w×h equirectangular canvas.
 * lng −180 → x = 0, lng +180 → x = w; lat +90 → y = 0, lat −90 → y = h.
 */
export function llToTexel(lat: number, lng: number, w: number, h: number): Texel {
  return { x: ((lng + 180) / 360) * w, y: ((90 - lat) / 180) * h };
}

/** A d3 projection that agrees with `llToTexel` for a w×h (2:1) canvas. */
export function makeProjection(w: number, h: number): GeoProjection {
  return geoEquirectangular()
    .scale(w / (2 * Math.PI))
    .translate([w / 2, h / 2])
    .precision(0.1);
}

type Topology = Parameters<typeof feature>[0];

/** Land geometry for painting: polygons to fill, and coastline arcs to stroke. */
export interface LandShapes {
  /** Land polygons (for fills). d3 closes polygons that cross ±180° along the clip edge. */
  land: GeoPermissibleObjects;
  /**
   * Coastline only, as a topojson mesh: the real arcs without the closure d3 adds when
   * clipping polygons at the antimeridian. Stroking `land` would draw those clip edges as
   * a straight line at ±180° (through Chukotka and Antarctica); stroking this doesn't.
   */
  coast: GeoPermissibleObjects;
}

/** Lazily loads Natural Earth 1:50m land (own chunk; cached after first call). */
export async function loadLand(): Promise<LandShapes> {
  const mod = (await import('world-atlas/land-50m.json')) as unknown as { default: Topology };
  const topo = mod.default;
  const land = topo.objects['land'];
  if (!land) throw new Error('world-atlas land-50m: missing "land" object');
  // @types/topojson-client types mesh()'s object with `{}` properties; the land object has none.
  return { land: feature(topo, land), coast: mesh(topo, land as Parameters<typeof mesh>[1]) };
}

function createCanvas(
  w: number,
  h: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
}

/** Paints the toy albedo: ocean, shallow-water halo, land, tundra, coastline, ice caps. */
export function paintAlbedo({ land, coast }: LandShapes, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(w, h);
  const path = geoPath(makeProjection(w, h), ctx);
  const px = w / 4096; // line widths are authored for a 4096-wide texture
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.fillStyle = EARTH_PALETTE.ocean;
  ctx.fillRect(0, 0, w, h);

  // Shallow-water halo: wide, soft strokes under the land (coast arcs only, no clip edges).
  ctx.beginPath();
  path(coast);
  ctx.strokeStyle = EARTH_PALETTE.shallowOuter;
  ctx.lineWidth = 22 * px;
  ctx.stroke();
  ctx.strokeStyle = EARTH_PALETTE.shallowInner;
  ctx.lineWidth = 9 * px;
  ctx.stroke();

  ctx.beginPath();
  path(land);
  ctx.fillStyle = EARTH_PALETTE.land;
  ctx.fill();

  // Tundra and ice caps: high-latitude land fades to white (Greenland, Arctic, Antarctica).
  const polar = ctx.createLinearGradient(0, 0, 0, h);
  for (const [lat, colour] of POLAR_TINT_STOPS) {
    polar.addColorStop(llToTexel(lat, 0, w, h).y / h, EARTH_PALETTE[colour]);
  }
  ctx.fillStyle = polar;
  ctx.fill(); // reuses the land path from above

  // Thin coastline on top (mesh arcs: no straight line along the ±180° texture edges).
  ctx.beginPath();
  path(coast);
  ctx.strokeStyle = EARTH_PALETTE.coast;
  ctx.lineWidth = 1.6 * px;
  ctx.stroke();

  return canvas;
}

const grey = (v: number): string => {
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${c}, ${c}, ${c})`;
};

/** Paints the roughness map (three reads the green channel): smooth water, matte land. */
export function paintRoughness(
  land: GeoPermissibleObjects,
  w: number,
  h: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(w, h);
  const path = geoPath(makeProjection(w, h), ctx);
  ctx.fillStyle = grey(EARTH_ROUGHNESS.water);
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  path(land);
  ctx.fillStyle = grey(EARTH_ROUGHNESS.land);
  ctx.fill();
  return canvas;
}
