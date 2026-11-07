/** Runtime capability checks. Pure DOM, no three.js — safe to run before the engine loads. */

export type WebGLVersion = 0 | 1 | 2;

export interface WebGLCheck {
  ok: boolean;
  version: WebGLVersion;
  /** Technical detail when `ok` is false (shown collapsed in the fallback screen). */
  reason?: string;
}

const CANDIDATES: ReadonlyArray<readonly [string, 1 | 2]> = [
  ['webgl2', 2],
  ['webgl', 1],
  ['experimental-webgl', 1],
];

type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

function release(gl: GLContext): void {
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Releasing is best-effort; the context is garbage-collected anyway.
  }
}

/**
 * Detects WebGL support by creating a throwaway canvas and trying `webgl2`,
 * then `webgl`. Never throws. Releases the probe context when possible so it
 * doesn't count against the browser's live-context limit.
 */
export function checkWebGL(doc: Document = document): WebGLCheck {
  let canvas: HTMLCanvasElement;
  try {
    canvas = doc.createElement('canvas');
  } catch (err) {
    return { ok: false, version: 0, reason: `Could not create a canvas: ${String(err)}` };
  }
  const errors: string[] = [];
  for (const [name, version] of CANDIDATES) {
    try {
      const gl = canvas.getContext(name) as GLContext | null;
      if (gl) {
        release(gl);
        return { ok: true, version };
      }
    } catch (err) {
      errors.push(`${name}: ${String(err)}`);
    }
  }
  const detail = errors.length ? ` (${errors.join('; ')})` : '';
  return {
    ok: false,
    version: 0,
    reason: `No WebGL context could be created${detail}. Hardware acceleration may be off, or the GPU may be blocklisted.`,
  };
}
