/**
 * PointerPicker: turns raw pointer events on the canvas into "hover here" and "tapped
 * here" for globe picking, without getting in OrbitControls' way (both listen to the
 * same canvas; nothing here calls preventDefault or stops propagation).
 *
 *  - Hover (mouse and pen only; touch has no hover): the latest position is recorded and
 *    consumed by the engine once per frame, so picking is throttled to rAF.
 *  - Tap: a single-pointer press released within TAP_SLOP_PX of where it started, never
 *    having strayed further. Drags (spinning the globe) and pinches never tap.
 *
 * Positions are reported in normalised device coordinates (−1…1, +y up).
 */
import { TAP_SLOP_PX, isTap } from './picking';

export interface Ndc {
  x: number;
  y: number;
}

interface Press {
  id: number;
  x: number;
  y: number;
  /** Furthest distance (CSS px) from the start seen so far. */
  maxMove: number;
}

export class PointerPicker {
  private readonly el: HTMLElement;
  private readonly onTap: (at: Ndc) => void;
  private readonly active = new Set<number>();
  private press: Press | null = null;
  /** Where the mouse/pen hovers (null: off the canvas, dragging, or touch). */
  private hoverAt: Ndc | null = null;
  private hoverDirty = false;

  constructor(el: HTMLElement, onTap: (at: Ndc) => void) {
    this.el = el;
    this.onTap = onTap;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', this.onLeave);
  }

  /** Current hover position, if any. */
  get hover(): Ndc | null {
    return this.hoverAt;
  }

  /** Ask for the hover pick to be redone next frame (e.g. the globe turned under the cursor). */
  invalidateHover(): void {
    if (this.hoverAt) this.hoverDirty = true;
  }

  /**
   * Returns true once per change of the hover state (position moved, pointer left, drag
   * started), so the engine picks at most once per frame. Read `hover` afterwards.
   */
  consumeHoverChange(): boolean {
    const dirty = this.hoverDirty;
    this.hoverDirty = false;
    return dirty;
  }

  dispose(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancel);
    el.removeEventListener('pointerleave', this.onLeave);
  }

  private toNdc(e: PointerEvent): Ndc {
    const r = this.el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      y: -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1),
    };
  }

  private setHover(at: Ndc | null): void {
    if (at === null && this.hoverAt === null) return;
    this.hoverAt = at;
    this.hoverDirty = true;
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.active.add(e.pointerId);
    // Only the primary mouse button; a second finger turns the gesture into a pinch.
    const ok = this.active.size === 1 && (e.pointerType !== 'mouse' || e.button === 0);
    this.press = ok ? { id: e.pointerId, x: e.clientX, y: e.clientY, maxMove: 0 } : null;
    if (e.pointerType !== 'touch') this.setHover(null); // no hover highlight while dragging
  };

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.press;
    if (p && p.id === e.pointerId) {
      p.maxMove = Math.max(p.maxMove, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    }
    if (e.pointerType === 'touch') return;
    this.setHover(e.buttons === 0 ? this.toNdc(e) : null);
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.active.delete(e.pointerId);
    const p = this.press;
    if (p && p.id === e.pointerId) {
      this.press = null;
      if (p.maxMove <= TAP_SLOP_PX && isTap(p.x, p.y, e.clientX, e.clientY)) {
        this.onTap(this.toNdc(e));
      }
    }
    if (e.pointerType !== 'touch') {
      // A captured drag may end outside the canvas: no hover there.
      const at = this.toNdc(e);
      this.setHover(Math.abs(at.x) <= 1 && Math.abs(at.y) <= 1 ? at : null);
    }
  };

  private readonly onCancel = (e: PointerEvent): void => {
    this.active.delete(e.pointerId);
    if (this.press?.id === e.pointerId) this.press = null;
    if (e.pointerType !== 'touch') this.setHover(null);
  };

  private readonly onLeave = (e: PointerEvent): void => {
    // With pointer capture (OrbitControls drags) leave fires on release; up handles that.
    if (e.pointerType !== 'touch' && !this.active.has(e.pointerId)) this.setHover(null);
  };
}
