/**
 * Line layers on the globe as fat, pixel-width lines (`LineSegments2`): `GL_LINES` is
 * always 1 px on most GPUs, which reads poorly on phones (PLAN §2, risks table).
 *
 *  - Country borders: ONE merged `LineSegments2` for the whole world, one neutral colour
 *    for every border (no political colouring of disputed areas). Two geometries, 110m
 *    and 50m, swapped by the engine's LOD policy; each is built once and kept.
 *  - Highlight outlines for the hovered and the selected country: a soft wide glow
 *    under a bright core line, built from that one country's own outline.
 *
 * The coastline is painted into the albedo (albedo.ts) and is deliberately not drawn here.
 */
import { Color, Group } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  BORDER_RADIUS,
  HIGHLIGHT_RADIUS,
  buildLinePositions,
  type BorderLevel,
} from './borderMath';
import type { CountryShape } from './countries';

/** Every colour the line layers use (own palette, no scattered hex). */
export const LINE_PALETTE = {
  border: '#fff6dc',
  hover: '#ffffff',
  hoverGlow: '#bfe9ff',
  selected: '#ffe066',
  selectedGlow: '#ff8a3d',
} as const;

const BORDER_OPACITY = 0.7;

interface OutlineStyle {
  core: string;
  glow: string;
  coreWidth: number;
  glowWidth: number;
  glowOpacity: number;
}

/** Hover and selection share a look; the selection is warmer, wider and stronger. */
const HOVER_STYLE: OutlineStyle = {
  core: LINE_PALETTE.hover,
  glow: LINE_PALETTE.hoverGlow,
  coreWidth: 2,
  glowWidth: 8,
  glowOpacity: 0.3,
};
const SELECTED_STYLE: OutlineStyle = {
  core: LINE_PALETTE.selected,
  glow: LINE_PALETTE.selectedGlow,
  coreWidth: 3,
  glowWidth: 12,
  glowOpacity: 0.45,
};

// Transparent objects draw in renderOrder: borders, (atmosphere = 1), glow, core.
const ORDER_BORDERS = 0;
const ORDER_GLOW = 2;
const ORDER_CORE = 3;

/** Shader source pair, as handed to `onBeforeCompile`. */
export interface ShaderSource {
  vertexShader: string;
  fragmentShader: string;
}

const VERTEX_ANCHOR = 'vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );';
const FRAGMENT_ANCHOR = 'gl_FragColor = vec4( diffuseColor.rgb, alpha );';

/**
 * Fades fat lines out at the globe's horizon. The depth test hides lines on the far
 * side, but a wide screen-space line just behind the limb pokes out past the globe's
 * silhouette, where there is nothing to hide it. So each vertex gets
 * dot(surface normal, direction to camera) — positive on the visible hemisphere — and
 * fragments fade to nothing as it reaches 0. Assumes the globe is centred at the
 * object's origin (true for everything in this file).
 *
 * Edits LineMaterial's shader text; returns false (leaving it untouched) if a three.js
 * update moved the anchors, which a unit test catches.
 */
export function injectHorizonFade(shader: ShaderSource): boolean {
  const { vertexShader: vs, fragmentShader: fs } = shader;
  if (!vs.includes(VERTEX_ANCHOR) || !fs.includes(FRAGMENT_ANCHOR)) return false;
  shader.vertexShader = vs
    .replace('void main() {', 'varying float vFacing;\nvoid main() {')
    .replace(
      VERTEX_ANCHOR,
      `${VERTEX_ANCHOR}
      {
        vec3 globeCentre = ( modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        vec3 p = ( position.y < 0.5 ) ? start.xyz : end.xyz;
        vFacing = dot( normalize( p - globeCentre ), normalize( -p ) );
      }`,
    );
  shader.fragmentShader = fs
    .replace('void main() {', 'varying float vFacing;\nvoid main() {')
    .replace(FRAGMENT_ANCHOR, `alpha *= smoothstep( 0.0, 0.06, vFacing );\n${FRAGMENT_ANCHOR}`);
  return true;
}

let warnedNoFade = false;

function lineMaterial(colour: string, width: number, opacity: number): LineMaterial {
  const material = new LineMaterial({
    color: new Color(colour),
    linewidth: width, // CSS px (worldUnits off); needs `resolution` kept up to date
    transparent: true, // also needed for the horizon fade
    opacity,
    depthTest: true, // the globe hides the far side
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    if (!injectHorizonFade(shader) && !warnedNoFade) {
      warnedNoFade = true;
      console.warn('[terra-toy] LineMaterial shader changed; horizon fade disabled');
    }
  };
  return material;
}

/** A glow + core pair sharing one geometry, showing one country (or nothing). */
class Outline {
  readonly glow: LineSegments2;
  readonly core: LineSegments2;
  /** Shared by glow and core (starts empty, replaced per country). */
  private geometry = new LineSegmentsGeometry();
  private shape: CountryShape | null = null;

  constructor(style: OutlineStyle, name: string) {
    this.glow = new LineSegments2(
      this.geometry,
      lineMaterial(style.glow, style.glowWidth, style.glowOpacity),
    );
    this.core = new LineSegments2(this.geometry, lineMaterial(style.core, style.coreWidth, 1));
    this.glow.name = `${name}-glow`;
    this.core.name = `${name}-core`;
    this.glow.renderOrder = ORDER_GLOW;
    this.core.renderOrder = ORDER_CORE;
    this.glow.visible = this.core.visible = false;
  }

  /** Shows `shape` (null hides). Returns true if anything changed. */
  show(shape: CountryShape | null): boolean {
    if (shape === this.shape) return false;
    this.shape = shape;
    if (shape) {
      const g = new LineSegmentsGeometry();
      g.setPositions(buildLinePositions(shape.outline().coordinates, { radius: HIGHLIGHT_RADIUS }));
      this.geometry.dispose();
      this.geometry = this.glow.geometry = this.core.geometry = g;
    }
    this.glow.visible = this.core.visible = shape !== null;
    return true;
  }

  setResolution(w: number, h: number): void {
    this.glow.material.resolution.set(w, h);
    this.core.material.resolution.set(w, h);
  }

  dispose(): void {
    this.geometry.dispose();
    this.glow.material.dispose();
    this.core.material.dispose();
  }
}

export class CountryLines {
  readonly group = new Group();
  private readonly borders: LineSegments2;
  private readonly borderMaterial: LineMaterial;
  private readonly borderGeometries = new Map<BorderLevel, LineSegmentsGeometry>();
  private readonly hover = new Outline(HOVER_STYLE, 'hover');
  private readonly selected = new Outline(SELECTED_STYLE, 'selected');
  private shownLevel: BorderLevel | null = null;

  constructor() {
    this.group.name = 'country-lines';
    this.borderMaterial = lineMaterial(LINE_PALETTE.border, 1, BORDER_OPACITY);
    this.borders = new LineSegments2(new LineSegmentsGeometry(), this.borderMaterial);
    this.borders.name = 'borders';
    this.borders.renderOrder = ORDER_BORDERS;
    this.borders.visible = false;
    this.group.add(this.borders, this.hover.glow, this.hover.core);
    this.group.add(this.selected.glow, this.selected.core);
  }

  /** The border level currently drawn (null before the first set arrives). */
  get level(): BorderLevel | null {
    return this.shownLevel;
  }

  hasBorders(level: BorderLevel): boolean {
    return this.borderGeometries.has(level);
  }

  /** Builds (once) the merged geometry for a level from its border lines. */
  addBorders(level: BorderLevel, lines: ReadonlyArray<ReadonlyArray<readonly number[]>>): void {
    if (this.borderGeometries.has(level)) return;
    const g = new LineSegmentsGeometry();
    g.setPositions(buildLinePositions(lines, { radius: BORDER_RADIUS }));
    this.borderGeometries.set(level, g);
  }

  /** Switches the drawn borders to `level` (must have been added). Returns true if changed. */
  showBorders(level: BorderLevel): boolean {
    const g = this.borderGeometries.get(level);
    if (!g || level === this.shownLevel) return false;
    // The first switch drops the empty placeholder; level geometries are kept and reused.
    if (this.shownLevel === null) this.borders.geometry.dispose();
    this.borders.geometry = g;
    this.borders.visible = true;
    this.shownLevel = level;
    return true;
  }

  /** Border width in CSS px. Returns true if it changed noticeably. */
  setBorderWidth(px: number): boolean {
    if (Math.abs(this.borderMaterial.linewidth - px) < 0.02) return false;
    this.borderMaterial.linewidth = px;
    return true;
  }

  /** Viewport size in CSS px: fat lines need it to turn pixel widths into clip space. */
  setResolution(w: number, h: number): void {
    this.borderMaterial.resolution.set(w, h);
    this.hover.setResolution(w, h);
    this.selected.setResolution(w, h);
  }

  /** Highlights. Each returns true if the picture changed. */
  showHover(shape: CountryShape | null): boolean {
    return this.hover.show(shape);
  }

  showSelected(shape: CountryShape | null): boolean {
    return this.selected.show(shape);
  }

  dispose(): void {
    this.group.removeFromParent();
    if (this.shownLevel === null) this.borders.geometry.dispose();
    for (const g of this.borderGeometries.values()) g.dispose();
    this.borderGeometries.clear();
    this.borderMaterial.dispose();
    this.hover.dispose();
    this.selected.dispose();
  }
}
