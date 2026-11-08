/**
 * Device-quality policy (PLAN §4 Phase 1). Pure functions, no DOM or WebGL, so
 * they can be unit-tested and reused by future texture/LOD decisions.
 */

/** Devices reporting this much RAM (GB, `navigator.deviceMemory`) or less are "low memory". */
export const LOW_MEMORY_GB = 4;

const isLowMemory = (deviceMemory?: number): boolean =>
  deviceMemory !== undefined && Number.isFinite(deviceMemory) && deviceMemory <= LOW_MEMORY_GB;

const sanitizeDpr = (dpr: number): number => (Number.isFinite(dpr) && dpr > 0 ? dpr : 1);

/**
 * Renderer pixel ratio: never above 2 (diminishing returns, 4× the fill cost of 1),
 * and never above 1.5 on low-memory devices.
 */
export function pickPixelRatio(dpr: number, deviceMemory?: number): number {
  const cap = isLowMemory(deviceMemory) ? 1.5 : 2;
  return Math.min(sanitizeDpr(dpr), cap);
}

export interface TextureSize {
  width: number;
  height: number;
}

/**
 * Equirectangular (2:1) Earth texture size: 4096×2048 on capable high-DPI devices,
 * otherwise 2048×1024 (low memory, DPR < 1.5, or a GPU that can't hold 4096).
 */
export function pickTextureSize(
  dpr: number,
  deviceMemory: number | undefined,
  maxTextureSize: number,
): TextureSize {
  const big = !isLowMemory(deviceMemory) && sanitizeDpr(dpr) >= 1.5 && maxTextureSize >= 4096;
  const width = big ? 4096 : 2048;
  return { width, height: width / 2 };
}
