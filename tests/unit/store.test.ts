import { describe, expect, it, vi } from 'vitest';
import { createToyStore, store } from '../../src/state/store';

describe('toy store', () => {
  it('starts in the loading phase with no WebGL info', () => {
    const s = createToyStore().getState();
    expect(s.boot).toBe('loading');
    expect(s.webgl).toEqual({ version: 0 });
  });

  it('updates boot phase and WebGL info via actions and notifies subscribers', () => {
    const st = createToyStore();
    const listener = vi.fn();
    const unsub = st.subscribe(listener);
    st.getState().setWebGL({ version: 2 });
    st.getState().setBoot('ready');
    expect(st.getState().boot).toBe('ready');
    expect(st.getState().webgl).toEqual({ version: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    st.getState().setBoot('no-webgl');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('copies WebGL info rather than keeping a caller reference', () => {
    const st = createToyStore();
    const info = { version: 0 as const, reason: 'nope' };
    st.getState().setWebGL(info);
    expect(st.getState().webgl).toEqual(info);
    expect(st.getState().webgl).not.toBe(info);
  });

  it('creates independent stores; the singleton is a store too', () => {
    const a = createToyStore();
    const b = createToyStore();
    a.getState().setBoot('ready');
    expect(b.getState().boot).toBe('loading');
    expect(typeof store.getState().setBoot).toBe('function');
  });
});
