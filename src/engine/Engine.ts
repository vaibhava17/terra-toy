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
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';
import type { ToyStore } from '../state/store';
import { mulberry32 } from '../game/rng';
import { GlobeRig } from './GlobeRig';
import { createEarth, type Earth } from './globe/Earth';
import { pickPixelRatio, pickTextureSize } from './quality';
import { CAMERA_FOV, viewFromPosition } from './rigMath';
import type { EngineHandle, GlobeController } from './view';

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

/** Above-left of the camera, in camera space; the sun follows the camera. */
const SUN_OFFSET: readonly [number, number, number] = [-1.6, 1.4, 0.4];

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
    this.scene.add(this.camera); // the sun is a child of the camera

    this.backdrop = makeBackdrop();
    this.scene.background = this.backdrop;

    this.scene.add(new HemisphereLight(SCENE_PALETTE.skyLight, SCENE_PALETTE.groundLight, 1.1));
    const sun = new DirectionalLight(SCENE_PALETTE.sun, 2.2);
    sun.position.set(...SUN_OFFSET);
    // The target stays at the world origin (not in the graph → identity matrixWorld).
    this.camera.add(sun);

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
    };

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
    const earth = await createEarth({
      textureSize: pickTextureSize(window.devicePixelRatio, deviceMemory(), caps.maxTextureSize),
      anisotropy: Math.min(8, caps.getMaxAnisotropy()),
    });
    if (this.disposed) {
      earth.dispose();
      return;
    }
    this.earth = earth;
    this.scene.add(earth.group);
    this.applyResize();
    // Upload textures and compile shaders now, so the first visible frame doesn't hitch.
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.store.getState().setGlobeView(viewFromPosition(this.camera.position));
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
    if (this.rig.update(dt)) this.needsRender = true;

    if (this.needsRender || this.debugEl) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.statFrames++;
    }
    if (this.debugEl && now - this.statSince >= 500) {
      const fps = (this.statFrames * 1000) / (now - this.statSince);
      this.debugEl.textContent = `${fps.toFixed(0)} fps · ${this.renderer.info.render.calls} calls`;
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
    this.needsRender = true;
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

/** Entry point used by the UI via dynamic `import()`. */
export function createEngine(options: EngineOptions): Promise<EngineHandle> {
  return Engine.create(options);
}
