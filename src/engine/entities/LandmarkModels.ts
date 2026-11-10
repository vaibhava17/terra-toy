/**
 * Landmark 3D models: the "live" tier of the icon ↔ live LOD (PLAN §3.3). Far away every
 * landmark is a pin (`Landmarks.ts`); once the camera comes close (`nextModelsShown`),
 * each landmark with a `model` that is above the horizon and past its `minZoom` loads its
 * baked procedural model (`loadModel`, cached per id) and shows it instead of its pin.
 *
 * Only models that have been near the camera are ever built or added to the scene; a
 * hidden model stays in the group with `visible = false` (no draw call). Each shown model
 * is one mesh (plus any `anim:*` parts) sharing the baked vertex-colour material.
 */
import { Group, Quaternion, type Object3D, type Ray, Vector3 } from 'three';
import type { LandmarkData } from '../../content/schema';
import { loadModel } from '../../models/index';
import { getBakedMaterial, type BakedModel } from '../../models/kit';
import { llToVec3, surfaceFrame } from '../geo';
import {
  floatingHeadLift,
  isAboveHorizon,
  isOnModelBase,
  isZoomVisible,
  layoutModelProxy,
  modelScaleForDistance,
  nextModelsShown,
  pickPin,
  type PinProxy,
} from './landmarkMath';

const DEG2RAD = Math.PI / 180;
const UP = new Vector3(0, 1, 0);

interface Entry {
  readonly landmark: LandmarkData;
  readonly modelId: string;
  readonly normal: Vector3;
  /** Surface frame turned by the landmark's heading (clockwise from north). */
  readonly frame: Quaternion;
  readonly proxy: PinProxy;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  baked: BakedModel | null;
  object: Object3D | null;
  /** Drawn this frame (and so pickable, with its pin hidden). */
  shown: boolean;
  /** World scale it is drawn at. */
  k: number;
}

export class LandmarkModels {
  readonly group = new Group();
  private readonly entries: Entry[];
  private readonly proxies: PinProxy[];
  private readonly index = new Map<string, number>();
  /** The distance LOD's state (shared by all landmarks: it only depends on the camera). */
  private near = false;
  private disposed = false;

  /** `onLoaded` runs when a model finishes loading (re-lay out and re-render). */
  constructor(
    landmarks: readonly LandmarkData[],
    private readonly onLoaded: () => void,
  ) {
    this.group.name = 'landmark-models';
    this.entries = [];
    for (const landmark of landmarks) {
      if (!landmark.model) continue;
      const { lat, lng } = landmark.pos;
      const yaw = new Quaternion().setFromAxisAngle(UP, -landmark.heading * DEG2RAD);
      this.index.set(landmark.id, this.entries.length);
      this.entries.push({
        landmark,
        modelId: landmark.model,
        normal: llToVec3(lat, lng),
        frame: surfaceFrame(lat, lng).multiply(yaw),
        proxy: { centre: new Vector3(), radius: 0, visible: false },
        state: 'idle',
        baked: null,
        object: null,
        shown: false,
        k: 0,
      });
    }
    this.proxies = this.entries.map((e) => e.proxy);
  }

  /**
   * Picks which models show for a camera position and zoom distance (the rig's orbit
   * distance; LOD and scale follow it, the horizon cull uses the real camera), places
   * and scales them, and starts loading any that are wanted but not loaded yet.
   * Returns true if any model appeared or disappeared.
   */
  update(cameraPos: Vector3, d = cameraPos.length()): boolean {
    this.near = nextModelsShown(d, this.near);
    let changed = false;
    for (const e of this.entries) {
      const wanted =
        this.near && isAboveHorizon(e.normal, cameraPos) && isZoomVisible(e.landmark.minZoom, d);
      if (wanted && e.state === 'idle') this.load(e);
      const show = wanted && e.state === 'ready';
      if (show !== e.shown) changed = true;
      e.shown = show;
      e.k = modelScaleForDistance(d, e.landmark.scale);
      if (e.object) {
        e.object.visible = show;
        if (show) e.object.scale.setScalar(e.k);
      }
      if (e.baked) layoutModelProxy(e.normal, e.baked.min, e.baked.max, e.k, show, e.proxy);
      else e.proxy.visible = false;
    }
    return changed;
  }

  /**
   * World height above the ground where a selected landmark's floating pin head goes
   * (`floatingHeadLift`: over the model's top), or null if its model is not shown.
   */
  liftFor(id: string): number | null {
    const e = this.entries[this.index.get(id) ?? -1];
    return e?.shown && e.baked ? floatingHeadLift(e.baked.max.y, e.k) : null;
  }

  /** True if the surface point (unit normal) lies on or just behind a shown model (`isOnModelBase`). */
  covers(normal: Vector3): boolean {
    for (const e of this.entries) {
      if (e.shown && e.baked && isOnModelBase(normal, e.normal, e.baked.min, e.baked.max, e.k)) {
        return true;
      }
    }
    return false;
  }

  /** Id of the nearest shown model hit by a world-space ray, or null. */
  pick(ray: Ray): string | null {
    const i = pickPin(ray, this.proxies);
    return i < 0 ? null : this.entries[i]!.landmark.id;
  }

  /** World position of a shown model's middle, or null. */
  anchor(id: string, target: Vector3): Vector3 | null {
    const e = this.entries[this.index.get(id) ?? -1];
    return e?.shown ? target.copy(e.proxy.centre) : null;
  }

  /** Ids of the landmarks drawn as models right now (for tests and the debug HUD). */
  shownIds(): string[] {
    return this.entries.filter((e) => e.shown).map((e) => e.landmark.id);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.group.clear();
    // The baked geometry stays cached in `loadModel`; three re-uploads it if it is drawn
    // again, so freeing the GPU side here is safe.
    for (const e of this.entries) for (const geo of e.baked?.geometries ?? []) geo.dispose();
    getBakedMaterial().dispose();
  }

  private load(e: Entry): void {
    e.state = 'loading';
    loadModel(e.modelId)
      .then((baked) => {
        if (this.disposed) return;
        const object = baked.object.clone();
        object.name = `model:${e.landmark.id}`;
        object.position.copy(e.normal);
        object.quaternion.copy(e.frame);
        object.visible = false;
        this.group.add(object);
        e.baked = baked;
        e.object = object;
        e.state = 'ready';
        this.onLoaded();
      })
      .catch((err: unknown) => {
        // Not fatal: the pin stays in its place.
        console.warn(`[terra-toy] could not load model ${e.modelId}`, err);
        e.state = 'failed';
      });
  }
}
