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
 * Data: Natural Earth 1:10m "admin 0 disputed areas" (public domain): every area of TYPE
 * Disputed, Breakaway or Indeterminate, plus leases and subunits that Natural Earth notes
 * as "Claimed by" someone (Kashmir and Siachen, Crimea, W. Sahara, Golan Heights,
 * N. Cyprus, Arunachal Pradesh, the Kurils, the Falklands and so on: 83 names). Left out:
 * the whole territories it also flags (Taiwan, Israel, Kosovo, Somaliland, Gaza, West
 * Bank, Belize, North Borneo/Sabah), which keep their normal country name, and areas that
 * are not disputes (Baikonur, Ceuta, Melilla, the Korean DMZ, the UNDOF zone).
 *
 * Two kinds of polygon:
 * - core: the area itself, at Natural Earth's 10m coastline.
 * - coast: the globe's own (world-atlas 110m/50m) coast often lies further out to sea, so
 *   a tap on the land you see near the shore can miss the core. Each coast polygon is the
 *   sea within ~20 km of an area (and nearer to it than to other land) and lists the
 *   world-atlas names its core maps to (Crimea: Russia). A point there counts as disputed
 *   only if world-atlas puts one of those countries under it, so open sea stays sea and a
 *   neighbour's coast keeps its name.
 * Regenerate with `scripts/disputed-areas.mjs`.
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
  /**
   * Coast polygons only: the world-atlas country names the area's core maps to. The
   * polygon counts only where world-atlas puts one of these under the point.
   */
  coast?: ReadonlySet<string>;
}

interface AreaProps {
  name: string;
  coast?: string[];
}

const BOX_PAD = 1e-6;

/** Splits the overlay into core areas and coast fringes, each with its bounding box. */
export function buildDisputedAreas(fc: FeatureCollection<Polygon, AreaProps>) {
  const core: DisputedArea[] = [];
  const coast: DisputedArea[] = [];
  for (const f of fc.features) {
    const [[west, south], [east, north]] = geoBounds(f);
    const area: DisputedArea = {
      name: f.properties.name,
      feature: f,
      box: {
        west: west - BOX_PAD,
        south: south - BOX_PAD,
        east: east + BOX_PAD,
        north: north + BOX_PAD,
      },
    };
    if (f.properties.coast) {
      area.coast = new Set(f.properties.coast);
      coast.push(area);
    } else {
      core.push(area);
    }
  }
  return { core, coast };
}

const built = buildDisputedAreas(data as FeatureCollection<Polygon, AreaProps>);
/** The disputed areas themselves (Natural Earth 10m). */
export const DISPUTED_AREAS: readonly DisputedArea[] = built.core;
/** Sea fringes along their coasts, for world-atlas's coarser coastline. */
export const DISPUTED_COASTS: readonly DisputedArea[] = built.coast;

const point: [number, number] = [0, 0];

/** The disputed area (core) containing (lat, lng), or null. */
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
 * The coast fringe containing (lat, lng) whose area world-atlas draws as `country`, or
 * null: world-atlas land just off a disputed area's 10m coast that belongs to it.
 */
export function disputedCoastAt(
  lat: number,
  lng: number,
  country: string,
  coasts: readonly DisputedArea[] = DISPUTED_COASTS,
): DisputedArea | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  point[0] = lng;
  point[1] = lat;
  for (const a of coasts) {
    if (a.coast?.has(country) && boxContains(a.box, lat, lng) && geoContains(a.feature, point)) {
      return a;
    }
  }
  return null;
}

/**
 * What the store and name chip get for a point on the globe: the neutral disputed ref if
 * the point is in a disputed area (or on world-atlas's coarser coast of one), else the
 * country there, else null (sea).
 */
export function pickCountryRef(index: CountryIndex, lat: number, lng: number): CountryRef | null {
  if (disputedAreaAt(lat, lng)) return DISPUTED_REF;
  const shape = index.pick(lat, lng);
  if (!shape) return null;
  if (disputedCoastAt(lat, lng, shape.name)) return DISPUTED_REF;
  return { id: shape.id, name: shape.name };
}
