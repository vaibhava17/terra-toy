/**
 * Landmark pins: one small stylised map pin (cone stem + ball head) per landmark, standing
 * on the globe and oriented with `surfaceFrame`. Until the procedural landmark models land,
 * these pins are how landmarks appear on the globe.
 *
 * Draw calls stay flat however many landmarks there are: all stems are one InstancedMesh
 * and all heads another, sharing one material. Culled pins get a zero-scale matrix.
 * The math (scale-by-zoom, horizon cull, minZoom, proxy picking) is in `landmarkMath.ts`.
 */
import {
  Color,
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  type Ray,
  SphereGeometry,
  Vector3,
} from 'three';
import type { LandmarkData } from '../../content/schema';
import { llToVec3, surfaceFrame } from '../geo';
import {
  SELECTED_PIN_GROWTH,
  layoutPinProxy,
  pickPin,
  pinScaleForDistance,
  type PinProxy,
} from './landmarkMath';

/** Every colour the pins use (own palette, no scattered hex). */
export const PIN_PALETTE = {
  stem: '#fff6dc',
  head: '#ff5a5f',
  selectedStem: '#ffffff',
  selectedHead: '#ffd43b',
} as const;

// Pin shape, in pin units (the tip touches the ground at y = 0, +Y is up).
const STEM_HEIGHT = 1;
const STEM_RADIUS = 0.16;
const HEAD_RADIUS = 0.34;
const HEAD_Y = 1.2;
const RADIAL_SEGMENTS = 10;

interface Pin {
  readonly landmark: LandmarkData;
  readonly normal: Vector3;
  readonly frame: Quaternion;
  readonly proxy: PinProxy;
}

export class LandmarkPins {
  readonly group = new Group();
  private readonly pins: Pin[];
  /** The pins' proxies, in pin order (kept as an array so picking allocates nothing). */
  private readonly proxies: PinProxy[];
  private readonly index = new Map<string, number>();
  private readonly stems: InstancedMesh;
  private readonly heads: InstancedMesh;
  private readonly material: MeshStandardMaterial;
  private selected = -1;

  constructor(landmarks: readonly LandmarkData[]) {
    this.group.name = 'landmark-pins';
    this.pins = landmarks.map((landmark, i) => {
      this.index.set(landmark.id, i);
      const { lat, lng } = landmark.pos;
      return {
        landmark,
        normal: llToVec3(lat, lng),
        frame: surfaceFrame(lat, lng),
        proxy: { centre: new Vector3(), radius: 0, visible: false },
      };
    });
    this.proxies = this.pins.map((p) => p.proxy);

    const stem = new ConeGeometry(STEM_RADIUS, STEM_HEIGHT, RADIAL_SEGMENTS);
    stem.rotateX(Math.PI); // point down…
    stem.translate(0, STEM_HEIGHT / 2, 0); // …with the tip on the ground
    const head = new SphereGeometry(HEAD_RADIUS, RADIAL_SEGMENTS + 2, RADIAL_SEGMENTS - 2);
    head.translate(0, HEAD_Y, 0);
    // White base colour: the per-instance colours carry the palette.
    this.material = new MeshStandardMaterial({ roughness: 0.45, metalness: 0 });

    const n = Math.max(1, this.pins.length);
    this.stems = new InstancedMesh(stem, this.material, n);
    this.heads = new InstancedMesh(head, this.material, n);
    this.stems.name = 'landmark-pin-stems';
    this.heads.name = 'landmark-pin-heads';
    this.stems.count = this.heads.count = this.pins.length;
    for (const mesh of [this.stems, this.heads]) {
      // Pins move around the whole globe; the instance bounds are not worth maintaining.
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.applyColours();
  }

  /** Highlights a landmark's pin (null: none). Returns true if the picture changed. */
  setSelected(id: string | null): boolean {
    const i = id === null ? -1 : (this.index.get(id) ?? -1);
    if (i === this.selected) return false;
    this.selected = i;
    this.applyColours();
    return true;
  }

  /** Re-places every pin for a camera position: scale-by-zoom, horizon and minZoom cull. */
  update(cameraPos: Vector3): void {
    const k = pinScaleForDistance(cameraPos.length());
    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i]!;
      const s = i === this.selected ? k * SELECTED_PIN_GROWTH : k;
      const visible = layoutPinProxy(pin.normal, pin.landmark.minZoom, cameraPos, s, pin.proxy);
      _scale.setScalar(visible ? s : 0);
      _m.compose(pin.normal, pin.frame, _scale);
      this.stems.setMatrixAt(i, _m);
      this.heads.setMatrixAt(i, _m);
    }
    this.stems.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  /** Id of the nearest visible pin hit by a world-space ray, or null. */
  pick(ray: Ray): string | null {
    const i = pickPin(ray, this.proxies);
    return i < 0 ? null : this.pins[i]!.landmark.id;
  }

  /** World position of a landmark pin's middle, or null if unknown or culled. */
  anchor(id: string, target: Vector3): Vector3 | null {
    const pin = this.pins[this.index.get(id) ?? -1];
    return pin?.proxy.visible ? target.copy(pin.proxy.centre) : null;
  }

  find(id: string): LandmarkData | undefined {
    return this.pins[this.index.get(id) ?? -1]?.landmark;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.stems.geometry.dispose();
    this.heads.geometry.dispose();
    this.stems.dispose();
    this.heads.dispose();
    this.material.dispose();
  }

  private applyColours(): void {
    for (let i = 0; i < this.pins.length; i++) {
      const sel = i === this.selected;
      this.stems.setColorAt(i, sel ? COLOURS.selectedStem : COLOURS.stem);
      this.heads.setColorAt(i, sel ? COLOURS.selectedHead : COLOURS.head);
    }
    if (this.stems.instanceColor) this.stems.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
  }
}

const COLOURS = {
  stem: new Color(PIN_PALETTE.stem),
  head: new Color(PIN_PALETTE.head),
  selectedStem: new Color(PIN_PALETTE.selectedStem),
  selectedHead: new Color(PIN_PALETTE.selectedHead),
};

const _m = new Matrix4();
const _scale = new Vector3();
