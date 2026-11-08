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
