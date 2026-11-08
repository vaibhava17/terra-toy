/**
 * Country shapes from Natural Earth via `world-atlas` (ISC): the internal land borders
 * as one mesh, and one feature per country for picking and highlight outlines.
 *
 * Each resolution is its own lazily loaded chunk: 110m comes with the engine at boot,
 * 50m only once the camera first zooms in (see `nextBorderLevel`).
 */
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { feature, mesh } from 'topojson-client';
import type { CountryRef } from '../view';
import type { BorderLevel } from './borderMath';

type Topology = Parameters<typeof feature>[0];
type MeshObject = Parameters<typeof mesh>[1];

export interface CountryShape extends CountryRef {
  feature: Feature<Polygon | MultiPolygon>;
  /** The country's own outline (all of its arcs: land borders and coast). */
  outline(): MultiLineString;
}

export interface CountrySet {
  level: BorderLevel;
  /** Internal land borders only: arcs shared by two different countries. */
  borders: MultiLineString;
  countries: CountryShape[];
}

interface CountryProps {
  name?: string;
}

/** Turns a world-atlas countries topology into borders + per-country shapes. Pure. */
export function buildCountrySet(topo: Topology, level: BorderLevel): CountrySet {
  const obj = topo.objects['countries'];
  if (!obj || obj.type !== 'GeometryCollection') {
    throw new Error(`world-atlas countries-${level}: missing "countries" collection`);
  }
  // Each arc between two *different* countries once; coastlines (a === b) are left to the
  // albedo, which already paints them.
  const borders = mesh(topo, obj as MeshObject, (a, b) => a !== b);
  const countries: CountryShape[] = [];
  for (const geom of obj.geometries) {
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') continue;
    const name = (geom.properties as CountryProps | undefined)?.name ?? '';
    const id = geom.id !== undefined ? String(geom.id) : name;
    if (!id) continue;
    let outline: MultiLineString | null = null;
    countries.push({
      id,
      name: name || id,
      feature: feature(topo, geom) as Feature<Polygon | MultiPolygon>,
      outline: () => (outline ??= mesh(topo, geom as MeshObject)),
    });
  }
  return { level, borders, countries };
}

const cache = new Map<BorderLevel, Promise<CountrySet>>();

/** Loads (once) and builds the country set for a resolution. Each is a separate chunk. */
export function loadCountrySet(level: BorderLevel): Promise<CountrySet> {
  let p = cache.get(level);
  if (!p) {
    const load =
      level === '50m'
        ? import('world-atlas/countries-50m.json')
        : import('world-atlas/countries-110m.json');
    p = load.then((mod) =>
      buildCountrySet((mod as unknown as { default: Topology }).default, level),
    );
    // A failed load (e.g. offline) may be retried later instead of being cached forever.
    p.catch(() => cache.delete(level));
    cache.set(level, p);
  }
  return p;
}
