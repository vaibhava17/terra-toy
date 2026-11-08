/**
 * Neutral labelling of disputed areas (PLAN.md: neutral display, no political colouring).
 *
 * world-atlas tags most disputed land with one claimant's country (tapping Srinagar said
 * "India", Gilgit "Pakistan", Aksai Chin "China"), and has no "disputed" flag of its own.
 * So we carry a small overlay of disputed polygons and check it *before* the country
 * pick: a point inside one is reported as "Disputed area", whoever administers it.
 *
 * The overlay is used for picking only. It draws no lines, and a disputed area gets no
 * highlight outline, so the border rendering is unchanged.
 *
 * Data: Natural Earth 1:10m "admin 0 disputed areas" (public domain), every area the file
 * flags (Kashmir and Siachen, Crimea, W. Sahara, Golan Heights, N. Cyprus, Arunachal
 * Pradesh, the Kurils, the Falklands and so on: 90 names), except the whole territories
 * it also flags (Taiwan, Israel, Kosovo, Somaliland, Gaza, West Bank, Belize, North
 * Borneo/Sabah), which keep their normal country name. Each MultiPolygon is split into
 * Polygons, coordinates rounded to 0.001°. Regenerate it with `scripts/disputed-areas.mjs`.
 */
import { geoBounds, geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { CountryRef } from '../view';
import { boxContains, type CountryIndex, type LngLatBox } from './countryPick';
import data from './disputed-areas.json';

/** What the name chip shows for any disputed area. */
export const DISPUTED_LABEL = 'Disputed area';

/**
 * One ref for every disputed area: moving between two adjacent ones is not a change, and
 * `find` never matches a country shape, so no claimant's outline is highlighted.
 */
export const DISPUTED_REF: Readonly<CountryRef> = Object.freeze({
  id: 'disputed',
  name: DISPUTED_LABEL,
});

export interface DisputedArea {
  /** Natural Earth's name for the area (for tests and debugging; never displayed). */
  name: string;
  feature: Feature<Polygon>;
  box: LngLatBox;
}

const BOX_PAD = 1e-6;

export function buildDisputedAreas(fc: FeatureCollection<Polygon, { name: string }>) {
  return fc.features.map((f): DisputedArea => {
    const [[west, south], [east, north]] = geoBounds(f);
    return {
      name: f.properties.name,
      feature: f,
      box: {
        west: west - BOX_PAD,
        south: south - BOX_PAD,
        east: east + BOX_PAD,
        north: north + BOX_PAD,
      },
    };
  });
}

export const DISPUTED_AREAS: readonly DisputedArea[] = buildDisputedAreas(
  data as FeatureCollection<Polygon, { name: string }>,
);

const point: [number, number] = [0, 0];

/** The disputed area containing (lat, lng), or null. */
export function disputedAreaAt(
  lat: number,
  lng: number,
  areas: readonly DisputedArea[] = DISPUTED_AREAS,
): DisputedArea | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  point[0] = lng;
  point[1] = lat;
  for (const a of areas) {
    if (boxContains(a.box, lat, lng) && geoContains(a.feature, point)) return a;
  }
  return null;
}

/**
 * What the store and name chip get for a point on the globe: the neutral disputed ref if
 * the point is in a disputed area, else the country there, else null (sea).
 */
export function pickCountryRef(index: CountryIndex, lat: number, lng: number): CountryRef | null {
  if (disputedAreaAt(lat, lng)) return DISPUTED_REF;
  const shape = index.pick(lat, lng);
  return shape ? { id: shape.id, name: shape.name } : null;
}
