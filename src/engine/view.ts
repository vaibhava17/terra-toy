/**
 * Camera view description shared by the engine, the store and the UI.
 * Deliberately free of three.js so the store and UI can import it cheaply.
 */

export interface GlobeViewState {
  /** Latitude of the point under the camera, degrees. */
  lat: number;
  /** Longitude of the point under the camera, degrees. */
  lng: number;
  /** Camera distance from the globe centre (globe radius = 1). */
  distance: number;
}

/** The friendly start view: Africa/Europe/Atlantic in frame. */
export const DEFAULT_VIEW: Readonly<GlobeViewState> = Object.freeze({
  lat: 20,
  lng: 10,
  distance: 3,
});

/** A country as the store and UI see it (picked on the globe by the engine). */
export interface CountryRef {
  /** ISO 3166-1 numeric code from Natural Earth, or the name for the few without one. */
  id: string;
  /** English display name from Natural Earth. */
  name: string;
}

/** Same country? (Null-safe; compares id and name.) */
export function sameCountry(a: CountryRef | null, b: CountryRef | null): boolean {
  if (a === null || b === null) return a === b;
  return a.id === b.id && a.name === b.name;
}

/** What the UI may ask the globe to do. Implemented by the engine's GlobeRig. */
export interface GlobeController {
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  flyTo(lat: number, lng: number, distance?: number, durationMs?: number): void;
}

/** The handle the UI gets back from `createEngine` (no three.js types leak out). */
export interface EngineHandle {
  readonly controller: GlobeController;
  dispose(): void;
}
