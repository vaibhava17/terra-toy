/**
 * Which country is at (lat, lng)? Pure and cheap enough to run on every hover frame:
 * a precomputed bounding box per country rejects almost everything before the exact
 * (spherical) point-in-polygon test with d3-geo's `geoContains`.
 */
import { geoBounds, geoContains } from 'd3-geo';
import type { CountryRef } from '../view';
import type { CountryShape } from './countries';

/**
 * Lat/lng box from `geoBounds`. When `west > east` the box crosses the antimeridian
 * (Russia, Fiji, the USA at 50m): it covers lng ≥ west *or* lng ≤ east.
 */
export interface LngLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Bounding box of a GeoJSON object (spherical, antimeridian-aware). */
export function boxOf(shape: CountryShape): LngLatBox {
  const [[west, south], [east, north]] = geoBounds(shape.feature);
  return { west, south, east, north };
}

/** Is (lat, lng) inside the box? Handles boxes that cross the antimeridian. */
export function boxContains(box: LngLatBox, lat: number, lng: number): boolean {
  if (lat < box.south || lat > box.north) return false;
  return box.west <= box.east
    ? lng >= box.west && lng <= box.east
    : lng >= box.west || lng <= box.east;
}

/** Tolerance (degrees) added to every box so rounding at the edges never rejects a hit. */
const BOX_PAD = 1e-6;

export interface CountryIndex {
  /** The country containing (lat, lng), or null over the sea. */
  pick(lat: number, lng: number): CountryShape | null;
  /** The shape for a country picked earlier, possibly from another resolution. */
  find(ref: CountryRef): CountryShape | undefined;
}

export function buildCountryIndex(countries: readonly CountryShape[]): CountryIndex {
  const entries = countries.map((shape) => {
    const b = boxOf(shape);
    const box: LngLatBox = {
      west: b.west - BOX_PAD,
      south: b.south - BOX_PAD,
      east: b.east + BOX_PAD,
      north: b.north + BOX_PAD,
    };
    return { shape, box };
  });
  const byId = new Map<string, CountryShape[]>();
  for (const c of countries) {
    const list = byId.get(c.id);
    if (list) list.push(c);
    else byId.set(c.id, [c]);
  }
  const point: [number, number] = [0, 0];

  return {
    pick(lat, lng) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      point[0] = lng;
      point[1] = lat;
      for (const { shape, box } of entries) {
        if (boxContains(box, lat, lng) && geoContains(shape.feature, point)) return shape;
      }
      return null;
    },
    find({ id, name }) {
      const list = byId.get(id);
      if (!list) return undefined;
      // Natural Earth reuses a code now and then (e.g. a territory sharing its parent's);
      // the name tells them apart.
      return list.find((c) => c.name === name) ?? list[0];
    },
  };
}
