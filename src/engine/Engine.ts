/**
 * Engine: owns the renderer, scene, camera, frame loop and resize handling.
 * Framework-agnostic — it never imports Preact and talks to the UI only through
 * the zustand store (PLAN §2). Loaded lazily (dynamic import) so three.js lives in
 * its own chunk.
 */
import {
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { ToyStore } from '../state/store';
import { LANDMARKS } from '../content/landmarks';
import { mulberry32 } from '../game/rng';
import { GlobeRig } from './GlobeRig';
import { PointerPicker, type Ndc } from './PointerPicker';
import { vec3ToLl } from './geo';
import { LandmarkModels } from './entities/LandmarkModels';
import { LandmarkPins } from './entities/Landmarks';
import { landmarkFlyDistance } from './entities/landmarkMath';
import { CountryLines } from './globe/Lines';
import { borderWidthForDistance, nextBorderLevel, type BorderLevel } from './globe/borderMath';
import { buildCountryIndex, type CountryIndex } from './globe/countryPick';
import { pickCountryRef } from './globe/disputed';
import { loadCountrySet, type CountrySet } from './globe/countries';
import { createEarth, type Earth } from './globe/Earth';
import { intersectGlobe } from './picking';
import { pickPixelRatio, pickTextureSize } from './quality';
import { CAMERA_FOV } from './rigMath';
import {
  sameCountry,
  type CountryRef,
  type EngineHandle,
  type GlobeController,
  type ScreenPoint,
} from './view';

export interface EngineOptions {
  /** Element the canvas is appended to; its size drives the canvas size. */
  host: HTMLElement;
  store: ToyStore;
  /** Show the fps / draw-call overlay and render every frame. */
  debug?: boolean;
}

/** Colours for the scene backdrop and lights (own palette, no scattered hex). */
const SCENE_PALETTE = {
  spaceInner: '#2b5fa8',
  spaceOuter: '#0f1d3d',
  star: 'rgba(255, 255, 255, 0.8)',
  skyLight: 0xe4f3ff,
  groundLight: 0x3a4a6b,
  sun: 0xfff6e8,
} as const;

/**
 * Where the sun shines from, in camera space (it follows the camera): from the viewer's
 * left, a little above eye level. On the tilted close-up view this lights the walls that
 * face the camera as well as the roofs; a sun from high above left them in the dark.
 */
const SUN_DIRECTION: readonly [number, number, number] = [-0.5, 0.15, 0.85];
/** The hemisphere light's "sky" is toward the viewer (camera space, far along +Z). */
const SKY_OFFSET: readonly [number, number, number] = [0, 0, 1000];

const deviceMemory = (): number | undefined =>
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory;

/** A soft radial "toy space" backdrop with a few stars (drawn once, stretched to the viewport). */
function makeBackdrop(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.05,
      size / 2,
      size / 2,
      size * 0.75,
    );
    g.addColorStop(0, SCENE_PALETTE.spaceInner);
    g.addColorStop(1, SCENE_PALETTE.spaceOuter);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const rand = mulberry32(2026);
    ctx.fillStyle = SCENE_PALETTE.star;
    for (let i = 0; i < 90; i++) {
      const r = 0.4 + rand() * 1.1;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class Engine implements EngineHandle {
  readonly controller: GlobeController;

  private readonly host: HTMLElement;
  private readonly store: ToyStore;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly rig: GlobeRig;
  private readonly backdrop: CanvasTexture;
  private readonly resizeObserver: ResizeObserver;
  private readonly debugEl: HTMLDivElement | null = null;
  private earth: Earth | null = null;
  private readonly lines = new CountryLines();
  private readonly pins = new LandmarkPins(LANDMARKS);
  private readonly models = new LandmarkModels(LANDMARKS, () => this.onModelLoaded());
  /** Pins ask this whether their landmark is drawn as a model (bound once, no per-frame closure). */
  private readonly picker: PointerPicker;
  private readonly raycaster = new Raycaster();
  private unsubscribeStore: (() => void) | null = null;
  /** Best country data loaded so far (50m once it has arrived, else 110m) and its index. */
  private countrySet: CountrySet | null = null;
  private countryIndex: CountryIndex | null = null;
  /** Border level the LOD policy wants (the drawn one may lag while 50m loads). */
  private borderLevel: BorderLevel = '110m';
  /** A border level being fetched, or one that failed to load (not retried this session). */
  private readonly borderLoads = new Map<BorderLevel, 'loading' | 'failed'>();

  private rafId = 0;
  private lastTime = 0;
  private needsRender = true;
  private needsResize = true;
  private disposed = false;

  // Debug stats (updated twice a second).
  private statFrames = 0;
  private statSince = 0;

  private constructor({ host, store, debug = false }: EngineOptions) {
    this.host = host;
    this.store = store;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(pickPixelRatio(window.devicePixelRatio, deviceMemory()));
    renderer.domElement.classList.add('globe-canvas');
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D globe. Drag to spin, pinch or scroll to zoom.',
    );
    renderer.domElement.setAttribute('role', 'img');
    this.renderer = renderer;
    host.appendChild(renderer.domElement);

    this.camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.01, 100);
    this.scene.add(this.camera); // the lights are children of the camera

    this.backdrop = makeBackdrop();
    this.scene.background = this.backdrop;

    // Both lights ride on the camera. A hemisphere light's direction is its world
    // position, so far along the camera's +Z its sky faces the viewer (a world-+Y sky lit
    // models on the sides of the globe from the wrong side). The sun aims at its target,
    // also a child of the camera, so its direction is fixed in camera space.
    const sky = new HemisphereLight(SCENE_PALETTE.skyLight, SCENE_PALETTE.groundLight, 1.1);
    sky.position.set(...SKY_OFFSET);
    const sun = new DirectionalLight(SCENE_PALETTE.sun, 2.2);
    sun.position.set(...SUN_DIRECTION);
    this.camera.add(sky, sun, sun.target);

    this.rig = new GlobeRig({
      camera: this.camera,
      domElement: renderer.domElement,
      onViewSettled: (view) => this.store.getState().setGlobeView(view),
      requestRender: () => {
        this.needsRender = true;
      },
    });
    this.controller = {
      zoomIn: () => this.rig.zoomIn(),
      zoomOut: () => this.rig.zoomOut(),
      resetView: () => this.rig.resetView(),
      flyTo: (lat, lng, distance, durationMs) => this.rig.flyTo(lat, lng, distance, durationMs),
      flyToLandmark: (id) => this.flyToLandmark(id),
      landmarkScreenPos: (id) => this.landmarkScreenPos(id),
      debugState: () => ({ visibleModels: this.models.shownIds() }),
    };

    this.picker = new PointerPicker(renderer.domElement, (at) => this.onTap(at));

    this.resizeObserver = new ResizeObserver(() => {
      this.needsResize = true;
    });
    this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange', this.onVisibility);
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    if (debug) {
      const el = document.createElement('div');
      el.className = 'debug-overlay';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);
      this.debugEl = el;
    }
  }

  /** Creates the engine, builds the Earth and starts the loop. Rejects on failure (and cleans up). */
  static async create(options: EngineOptions): Promise<Engine> {
    const engine = new Engine(options);
    try {
      await engine.init();
    } catch (err) {
      engine.dispose();
      throw err;
    }
    return engine;
  }

  private async init(): Promise<void> {
    const caps = this.renderer.capabilities;
    const [earth, countries] = await Promise.all([
      createEarth({
        textureSize: pickTextureSize(window.devicePixelRatio, deviceMemory(), caps.maxTextureSize),
        anisotropy: Math.min(8, caps.getMaxAnisotropy()),
      }),
      loadCountrySet('110m'),
    ]);
    if (this.disposed) {
      earth.dispose();
      return;
    }
    this.earth = earth;
    this.scene.add(earth.group);
    this.scene.add(this.lines.group);
    this.scene.add(this.pins.group);
    this.scene.add(this.models.group);
    this.useCountrySet(countries);
    this.updateBorderLod();
    this.unsubscribeStore = this.store.subscribe((s, prev) => {
      if (
        s.globe.hoveredCountry !== prev.globe.hoveredCountry ||
        s.globe.selectedCountry !== prev.globe.selectedCountry
      ) {
        this.syncHighlights();
      }
      if (s.globe.selectedLandmark !== prev.globe.selectedLandmark) {
        this.onLandmarkSelected(s.globe.selectedLandmark);
      }
    });
    this.syncHighlights();
    this.pins.setSelected(this.store.getState().globe.selectedLandmark);
    this.updateLandmarks();
    this.applyResize();
    // Upload textures and compile shaders now, so the first visible frame doesn't hitch.
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.store.getState().setGlobeView(this.rig.view());
    this.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.rig.dispose();
    this.picker.dispose();
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    // The highlights go away with the globe; so does what they pointed at.
    const { setHoveredCountry, setSelectedCountry, setSelectedLandmark } = this.store.getState();
    setHoveredCountry(null);
    setSelectedCountry(null);
    setSelectedLandmark(null);
    this.lines.dispose();
    this.pins.dispose();
    this.models.dispose();
    this.earth?.dispose();
    this.earth = null;
    this.backdrop.dispose();
    this.scene.clear();
    this.renderer.dispose();
    canvas.remove();
    this.debugEl?.remove();
  }

  // ---- Loop --------------------------------------------------------------------------

  private start(): void {
    if (this.rafId || this.disposed || document.hidden) return;
    this.lastTime = performance.now();
    this.statSince = this.lastTime;
    this.statFrames = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    // Clamp dt so a long stall (tab switch, breakpoint) doesn't teleport flights/inertia.
    const dt = Math.min(100, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    if (this.needsResize) this.applyResize();
    // The rig must tick every frame: damping and flights keep animating after input ends.
    if (this.rig.update(dt)) {
      this.needsRender = true;
      this.updateBorderLod();
      this.updateLandmarks();
      this.picker.invalidateHover(); // the globe moved under a resting cursor
    }
    if (this.picker.consumeHoverChange()) this.updateHover();

    if (this.needsRender || this.debugEl) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.statFrames++;
    }
    if (this.debugEl && now - this.statSince >= 500) {
      const fps = (this.statFrames * 1000) / (now - this.statSince);
      const { calls } = this.renderer.info.render;
      const models = this.models.shownIds().length;
      this.debugEl.textContent = `${fps.toFixed(0)} fps · ${calls} calls · ${models} models`;
      this.statFrames = 0;
      this.statSince = now;
    }
  };

  private applyResize(): void {
    this.needsResize = false;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setPixelRatio(pickPixelRatio(window.devicePixelRatio, deviceMemory()));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lines.setResolution(w, h);
    this.needsRender = true;
  }

  // ---- Borders and country picking ---------------------------------------------------

  /** Picks the LOD level and width for the current zoom distance; loads 50m on demand. */
  private updateBorderLod(): void {
    const distance = this.rig.distance;
    if (this.lines.setBorderWidth(borderWidthForDistance(distance))) this.needsRender = true;
    const level = nextBorderLevel(distance, this.borderLevel);
    if (this.borderLoads.get(level) === 'failed') return;
    this.borderLevel = level;
    if (this.lines.hasBorders(level)) {
      if (this.lines.showBorders(level)) this.needsRender = true;
      return;
    }
    if (this.borderLoads.has(level)) return; // already on its way
    this.borderLoads.set(level, 'loading');
    loadCountrySet(level)
      .then((set) => {
        this.borderLoads.delete(level);
        if (this.disposed) return;
        this.useCountrySet(set);
        if (this.borderLevel === set.level && this.lines.showBorders(set.level)) {
          this.needsRender = true;
        }
      })
      .catch((err: unknown) => {
        // Not fatal: the coarser borders stay up.
        console.warn(`[terra-toy] could not load ${level} borders`, err);
        this.borderLoads.set(level, 'failed');
        this.borderLevel = '110m';
      });
  }

  /** Adds a country set's borders and, if it is more detailed, uses it for picking too. */
  private useCountrySet(set: CountrySet): void {
    this.lines.addBorders(set.level, set.borders.coordinates);
    if (this.countrySet?.level === '50m') return;
    this.countrySet = set;
    this.countryIndex = buildCountryIndex(set.countries);
    // Redraw any highlight from the new data (e.g. 110m → 50m outline).
    this.lines.showHover(null);
    this.lines.showSelected(null);
    this.syncHighlights();
  }

  /** Makes the highlight outlines match the store's hovered / selected countries. */
  private syncHighlights(): void {
    const index = this.countryIndex;
    if (!index || !this.unsubscribeStore) return;
    const { hoveredCountry: hovered, selectedCountry: selected } = this.store.getState().globe;
    const sel = selected ? (index.find(selected) ?? null) : null;
    // A selected country shows only its (stronger) selection outline.
    const hov = hovered && !sameCountry(hovered, selected) ? (index.find(hovered) ?? null) : null;
    const a = this.lines.showSelected(sel);
    const b = this.lines.showHover(hov);
    if (a || b) this.needsRender = true;
  }

  private updateHover(): void {
    const at = this.picker.hover;
    // A pin in front of a country wins: hovering it shows no country outline.
    const onPin = at ? this.pickLandmark(at) !== null : false;
    const country = at && !onPin ? this.pickCountry(at) : null;
    this.renderer.domElement.style.cursor = onPin || country ? 'pointer' : '';
    this.store.getState().setHoveredCountry(country);
  }

  /**
   * A tap tries the landmark pins first; a pin hit selects that landmark and leaves the
   * country selection to the store's rules. Otherwise country picking runs as before,
   * and a tap on the sea also closes the landmark card.
   */
  private onTap(at: Ndc): void {
    const state = this.store.getState();
    const landmark = this.pickLandmark(at);
    if (landmark !== null) {
      // Tapping the open landmark again flies back to it (the store sees no change).
      if (landmark === state.globe.selectedLandmark) this.flyToLandmark(landmark);
      else state.setSelectedLandmark(landmark);
      return;
    }
    const country = this.pickCountry(at);
    state.setSelectedCountry(country);
    if (country === null) state.setSelectedLandmark(null);
  }

  // ---- Landmarks ---------------------------------------------------------------------

  /** Lays out models first (they decide which pins step aside), then the pins. */
  private updateLandmarks(): void {
    const distance = this.rig.distance;
    this.models.update(this.camera.position, distance);
    this.pins.update(this.camera.position, distance, this.models);
  }

  private onModelLoaded(): void {
    if (this.disposed) return;
    this.updateLandmarks();
    this.needsRender = true;
  }

  private onLandmarkSelected(id: string | null): void {
    if (this.pins.setSelected(id)) {
      this.updateLandmarks(); // the selected pin is drawn bigger
      this.needsRender = true;
    }
    if (id !== null) this.flyToLandmark(id);
  }

  private flyToLandmark(id: string): void {
    const landmark = this.pins.find(id);
    if (!landmark) return;
    const { lat, lng } = landmark.pos;
    this.rig.flyTo(lat, lng, landmarkFlyDistance(this.rig.distance));
  }

  /** The landmark model or pin under a canvas position (NDC), or null. */
  private pickLandmark(at: Ndc): string | null {
    this.camera.updateMatrixWorld(); // the rig moved the camera since the last render
    this.raycaster.setFromCamera(_ndc.set(at.x, at.y), this.camera);
    const ray = this.raycaster.ray;
    return this.models.pick(ray) ?? this.pins.pick(ray);
  }

  private landmarkScreenPos(id: string): ScreenPoint | null {
    const p = this.models.anchor(id, _anchor) ?? this.pins.anchor(id, _anchor);
    if (!p) return null;
    this.camera.updateMatrixWorld();
    p.project(this.camera);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** The country under a canvas position (NDC), or null over the sea / off the globe. */
  private pickCountry(at: Ndc): CountryRef | null {
    const index = this.countryIndex;
    if (!index) return null;
    this.camera.updateMatrixWorld(); // the rig moved the camera since the last render
    this.raycaster.setFromCamera(_ndc.set(at.x, at.y), this.camera);
    const hit = intersectGlobe(this.raycaster.ray, _hit);
    if (!hit) return null;
    const { lat, lng } = vec3ToLl(hit);
    return pickCountryRef(index, lat, lng);
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.stop();
    } else {
      this.needsRender = true;
      this.start();
    }
  };

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault(); // allow the browser to restore it
    this.stop();
  };

  private readonly onContextRestored = (): void => {
    this.needsRender = true;
    this.start();
  };
}

const _ndc = new Vector2();
const _hit = new Vector3();
const _anchor = new Vector3();

/** Entry point used by the UI via dynamic `import()`. */
export function createEngine(options: EngineOptions): Promise<EngineHandle> {
  return Engine.create(options);
}
