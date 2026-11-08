/**
 * The stylised Earth: a lit sphere with a runtime-painted toy albedo, a sea-gloss
 * roughness map, and a soft Fresnel atmosphere shell (PLAN §3.3).
 */
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
} from 'three';
import { TEXTURE_FLIP_Y, loadLand, paintAlbedo, paintRoughness } from './albedo';
import type { TextureSize } from '../quality';

export const ATMOSPHERE_RADIUS = 1.03;
/** Soft light-blue rim. Linear-space colour for the shader. */
const ATMOSPHERE_COLOR = new Color(0x8fd3ff);
const ATMOSPHERE_STRENGTH = 1.1;

const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vViewNormal;
varying vec3 vToCamera;

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vToCamera = normalize(-viewPos.xyz);
  gl_Position = projectionMatrix * viewPos;
}
`;

// Back faces only: the visible fragments are the far half of the shell, seen through
// the ring between the Earth's limb and the shell's limb. There the outward normal
// points away from the camera, so -dot(n, toCamera) goes from 0 at the shell's edge up
// to uRimAtLimb at the Earth's edge. Normalise that to 0..1 and shape it into a glow.
const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uRimAtLimb;

varying vec3 vViewNormal;
varying vec3 vToCamera;

void main() {
  float facingAway = -dot(normalize(vViewNormal), normalize(vToCamera));
  float x = clamp(facingAway / uRimAtLimb, 0.0, 1.0);
  float glow = x * x * (3.0 - 2.0 * x);
  gl_FragColor = vec4(uColor * glow * uStrength, glow);
}
`;

export interface EarthOptions {
  textureSize: TextureSize;
  /** Max anisotropy to use for the albedo (from renderer capabilities). */
  anisotropy: number;
}

export interface Earth {
  readonly group: Group;
  dispose(): void;
}

function configureTexture(t: Texture, anisotropy: number): void {
  t.flipY = TEXTURE_FLIP_Y;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
}

export async function createEarth({ textureSize, anisotropy }: EarthOptions): Promise<Earth> {
  const land = await loadLand();
  const { width, height } = textureSize;

  const albedo = new CanvasTexture(paintAlbedo(land, width, height));
  albedo.colorSpace = SRGBColorSpace;
  configureTexture(albedo, anisotropy);

  // Roughness only needs half the resolution.
  const roughness = new CanvasTexture(paintRoughness(land, width / 2, height / 2));
  roughness.colorSpace = NoColorSpace;
  configureTexture(roughness, Math.min(anisotropy, 4));

  const sphereGeometry = new SphereGeometry(1, 128, 64);
  const earthMaterial = new MeshStandardMaterial({
    map: albedo,
    roughnessMap: roughness,
    roughness: 1,
    metalness: 0,
  });
  const earth = new Mesh(sphereGeometry, earthMaterial);
  earth.name = 'earth';

  const shellGeometry = new SphereGeometry(ATMOSPHERE_RADIUS, 96, 48);
  const atmosphereMaterial = new ShaderMaterial({
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    uniforms: {
      uColor: { value: ATMOSPHERE_COLOR },
      uStrength: { value: ATMOSPHERE_STRENGTH },
      uRimAtLimb: { value: Math.sqrt(1 - 1 / (ATMOSPHERE_RADIUS * ATMOSPHERE_RADIUS)) },
    },
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const atmosphere = new Mesh(shellGeometry, atmosphereMaterial);
  atmosphere.name = 'atmosphere';
  atmosphere.renderOrder = 1;

  const group = new Group();
  group.name = 'globe';
  group.add(earth, atmosphere);

  return {
    group,
    dispose() {
      group.removeFromParent();
      sphereGeometry.dispose();
      shellGeometry.dispose();
      earthMaterial.dispose();
      atmosphereMaterial.dispose();
      albedo.dispose();
      roughness.dispose();
    },
  };
}
