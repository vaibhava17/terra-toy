/**
 * GlobeRig: OrbitControls around the globe plus everything that makes it feel like
 * a toy — altitude-scaled rotate speed, a zoom-dependent tilt toward the horizon,
 * eased great-circle `flyTo`, zoom steps, and a gentle idle auto-rotate.
 *
 * All curves live in `rigMath.ts`. This class only wires them to three.js.
 *
 * How the tilt avoids fighting OrbitControls: the controls don't drive the rendered
 * camera at all. They drive a hidden *orbit* camera that sits straight above the
 * point being looked at (they read and write its position, also from inside their own
 * pointer handlers). Flights write the same orbit position. Each frame the rendered
 * camera is derived from it with `tiltedCameraPose`: a pitched orbit around that
 * surface point, so the point stays at the screen centre while the camera leans back
 * "behind" it as you zoom in. OrbitControls never sees the tilted pose, so the two
 * never fight, and inertia, the polar clamp and flyTo easing work exactly as before.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  MAX_CAMERA_LAT,
  MAX_DISTANCE,
  MIN_DISTANCE,
  createFlightPlan,
  planFlight,
  rotateSpeedForDistance,
  sampleFlight,
  tiltedCameraPose,
  viewFromPosition,
  zoomStep,
  cameraPosition,
} from './rigMath';
import { DEFAULT_VIEW, type CameraController, type GlobeViewState } from './view';

/** Idle time before the globe starts drifting on its own. */
export const IDLE_AUTO_ROTATE_MS = 8000;
/** OrbitControls autoRotateSpeed (2.0 = one turn per 30 s). Negative spins the globe eastward. */
const AUTO_ROTATE_SPEED = -0.5;
const ZOOM_STEP_MS = 450;
const REDUCED_MOTION_MAX_FLIGHT_MS = 300;

const POLAR_MARGIN = ((90 - MAX_CAMERA_LAT) * Math.PI) / 180;
const ORIGIN = new Vector3(0, 0, 0);

export interface GlobeRigOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
  /** Called (not every frame) when the camera has settled after user input or a flight. */
  onViewSettled: (view: GlobeViewState) => void;
  /** Called whenever something changed and a frame should be rendered. */
  requestRender: () => void;
}

export class GlobeRig implements CameraController {
  /** The rendered camera: its pose is derived from `orbit` every frame. */
  private readonly camera: PerspectiveCamera;
  /** What OrbitControls and flights move: straight above the target, looking at the centre. */
  private readonly orbit: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly onViewSettled: (view: GlobeViewState) => void;
  private readonly requestRender: () => void;
  private readonly motionQuery: MediaQueryList | null;

  private readonly plan = createFlightPlan();
  private flying = false;
  private flightElapsedMs = 0;

  private interacting = false;
  /** User input ended but damping may still be moving the camera. */
  private settling = false;
  private idleMs = 0;
  private reducedMotion = false;

  constructor({ camera, domElement, onViewSettled, requestRender }: GlobeRigOptions) {
    this.camera = camera;
    // A PerspectiveCamera (never rendered) so OrbitControls' dolly treats it as one.
    this.orbit = new PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
    this.onViewSettled = onViewSettled;
    this.requestRender = requestRender;

    const c = new OrbitControls(this.orbit, domElement);
    c.target.copy(ORIGIN);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = MIN_DISTANCE;
    c.maxDistance = MAX_DISTANCE;
    c.minPolarAngle = POLAR_MARGIN;
    c.maxPolarAngle = Math.PI - POLAR_MARGIN;
    c.zoomSpeed = 0.8;
    c.autoRotateSpeed = AUTO_ROTATE_SPEED;
    this.controls = c;

    c.addEventListener('start', this.onStart);
    c.addEventListener('end', this.onEnd);

    this.motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    this.reducedMotion = this.motionQuery?.matches ?? false;
    this.motionQuery?.addEventListener('change', this.onMotionChange);

    cameraPosition(DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance, this.orbit.position);
    c.update();
    this.applyTilt();
  }

  /** Zoom distance (the orbit's distance from the centre; drives LOD and scale). */
  get distance(): number {
    return this.orbit.position.length();
  }

  /** The current view: the point at the screen centre and the zoom distance. */
  view(): GlobeViewState {
    return viewFromPosition(this.orbit.position);
  }

  // ---- CameraController -------------------------------------------------------------

  flyTo(lat: number, lng: number, distance?: number, durationMs?: number): void {
    if (![lat, lng].every(Number.isFinite)) return;
    const d = distance ?? this.distance;
    planFlight(this.orbit.position, lat, lng, d, durationMs, this.plan);
    if (this.reducedMotion) {
      this.plan.durationMs = Math.min(this.plan.durationMs, REDUCED_MOTION_MAX_FLIGHT_MS);
    }
    this.stopMomentum();
    this.flying = true;
    this.flightElapsedMs = 0;
    this.settling = false;
    this.idleMs = 0;
    this.requestRender();
  }

  zoomIn(): void {
    this.zoomBy('in');
  }

  zoomOut(): void {
    this.zoomBy('out');
  }

  resetView(): void {
    this.flyTo(DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance);
  }

  // ---- Frame loop --------------------------------------------------------------------

  /**
   * Advances the rig by `dtMs`. Returns true if the camera moved (so the frame
   * should be rendered). Allocates nothing.
   */
  update(dtMs: number): boolean {
    let moved: boolean;
    if (this.flying) {
      this.flightElapsedMs += dtMs;
      const t = this.plan.durationMs > 0 ? this.flightElapsedMs / this.plan.durationMs : 1;
      sampleFlight(this.plan, t, this.orbit.position);
      this.orbit.lookAt(ORIGIN);
      moved = true;
      if (t >= 1) {
        this.flying = false;
        this.controls.update(); // sync the controls' internal state with the new position
        this.emitView();
      }
    } else {
      this.idleMs = this.interacting ? 0 : this.idleMs + dtMs;
      const auto = !this.reducedMotion && !this.interacting && this.idleMs >= IDLE_AUTO_ROTATE_MS;
      this.controls.autoRotate = auto;
      this.controls.rotateSpeed = rotateSpeedForDistance(this.distance);
      moved = this.controls.update(dtMs / 1000);
      if (this.settling && !moved && !this.interacting) {
        this.settling = false;
        this.emitView();
      }
    }
    this.applyTilt();
    return moved;
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.onStart);
    this.controls.removeEventListener('end', this.onEnd);
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.controls.dispose();
  }

  // ---- Internals ---------------------------------------------------------------------

  private zoomBy(direction: 'in' | 'out'): void {
    // While a flight is running, step from where it's heading so repeated taps add up.
    const base = this.flying ? this.plan.toDistance : this.distance;
    const { lat, lng } = this.flying
      ? viewFromPosition(sampleFlight(this.plan, 1, _tmp))
      : this.view();
    const remaining = this.flying ? Math.max(0, this.plan.durationMs - this.flightElapsedMs) : 0;
    this.flyTo(lat, lng, zoomStep(base, direction), Math.max(ZOOM_STEP_MS, remaining));
  }

  /** Places the rendered camera: a pitched orbit around the point under the orbit camera. */
  private applyTilt(): void {
    tiltedCameraPose(this.orbit.position, this.camera.position, this.camera.quaternion);
  }

  private emitView(): void {
    this.onViewSettled(this.view());
  }

  /**
   * Drops any leftover inertia so it doesn't kick in after a flight. OrbitControls has no
   * public API for this; the field is guarded so a future three.js rename is harmless.
   */
  private stopMomentum(): void {
    const delta = (this.controls as unknown as { _sphericalDelta?: { set(...a: number[]): void } })
      ._sphericalDelta;
    delta?.set(0, 0, 0);
  }

  private readonly onStart = (): void => {
    this.interacting = true;
    this.flying = false; // user input always wins over an in-flight flyTo
    this.settling = false;
    this.idleMs = 0;
    this.controls.autoRotate = false;
    this.requestRender();
  };

  private readonly onEnd = (): void => {
    this.interacting = false;
    this.settling = true;
    this.idleMs = 0;
    this.requestRender();
  };

  private readonly onMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
  };
}

const _tmp = new Vector3();
