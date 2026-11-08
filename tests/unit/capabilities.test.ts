// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWebGL } from '../../src/engine/capabilities';

type GetContext = (id: string) => unknown;

function mockCanvas(getContext: GetContext) {
  const canvas = { getContext: vi.fn(getContext) };
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas'
      ? (canvas as unknown as HTMLCanvasElement)
      : real(tag)) as typeof document.createElement);
  return canvas;
}

function fakeContext() {
  const loseContext = vi.fn();
  const getExtension = vi.fn((name: string) =>
    name === 'WEBGL_lose_context' ? { loseContext } : null,
  );
  return { ctx: { getExtension }, loseContext, getExtension };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkWebGL', () => {
  it('reports no WebGL when every getContext returns null', () => {
    const canvas = mockCanvas(() => null);
    const r = checkWebGL();
    expect(r.ok).toBe(false);
    expect(r.version).toBe(0);
    expect(r.reason).toMatch(/WebGL/);
    expect(canvas.getContext).toHaveBeenCalledWith('webgl2');
    expect(canvas.getContext).toHaveBeenCalledWith('webgl');
  });

  it('falls back to WebGL 1 when webgl2 is unavailable, and releases the context', () => {
    const { ctx, loseContext } = fakeContext();
    mockCanvas((id) => (id === 'webgl' ? ctx : null));
    expect(checkWebGL()).toEqual({ ok: true, version: 1 });
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('prefers WebGL 2 and releases the context', () => {
    const { ctx, loseContext } = fakeContext();
    const canvas = mockCanvas((id) => (id === 'webgl2' ? ctx : null));
    expect(checkWebGL()).toEqual({ ok: true, version: 2 });
    expect(canvas.getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('still succeeds when WEBGL_lose_context is missing', () => {
    mockCanvas((id) => (id === 'webgl2' ? { getExtension: () => null } : null));
    expect(checkWebGL()).toEqual({ ok: true, version: 2 });
  });

  it('never throws, even if getContext or createElement throw', () => {
    mockCanvas(() => {
      throw new Error('boom');
    });
    const r = checkWebGL();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('boom');

    vi.restoreAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('no canvas');
    });
    expect(() => checkWebGL()).not.toThrow();
    expect(checkWebGL()).toMatchObject({ ok: false, version: 0 });
  });
});
