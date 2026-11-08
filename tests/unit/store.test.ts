import { describe, expect, it, vi } from 'vitest';
import { createToyStore, store } from '../../src/state/store';
import { DEFAULT_VIEW } from '../../src/engine/view';

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

describe('globe slice', () => {
  it('starts idle at the default view', () => {
    const g = createToyStore().getState().globe;
    expect(g.status).toBe('idle');
    expect(g.error).toBeUndefined();
    expect(g.view).toEqual(DEFAULT_VIEW);
    expect(g.view).not.toBe(DEFAULT_VIEW);
  });

  it('moves through loading → ready and keeps the view', () => {
    const st = createToyStore();
    st.getState().setGlobeView({ lat: 1, lng: 2, distance: 2.5 });
    st.getState().setGlobeStatus('loading');
    expect(st.getState().globe.status).toBe('loading');
    st.getState().setGlobeStatus('ready');
    expect(st.getState().globe).toEqual({
      status: 'ready',
      view: { lat: 1, lng: 2, distance: 2.5 },
      hoveredCountry: null,
      selectedCountry: null,
    });
  });

  it('stores an error message only for the error status', () => {
    const st = createToyStore();
    st.getState().setGlobeStatus('error', 'boom');
    expect(st.getState().globe.status).toBe('error');
    expect(st.getState().globe.error).toBe('boom');
    st.getState().setGlobeStatus('loading');
    expect(st.getState().globe.error).toBeUndefined();
    st.getState().setGlobeStatus('ready', 'ignored');
    expect(st.getState().globe.error).toBeUndefined();
  });

  it('copies the view and notifies subscribers once per write', () => {
    const st = createToyStore();
    const listener = vi.fn();
    st.subscribe(listener);
    const view = { lat: 10, lng: -20, distance: 1.8 };
    st.getState().setGlobeView(view);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(st.getState().globe.view).toEqual(view);
    expect(st.getState().globe.view).not.toBe(view);
    expect(st.getState().globe.status).toBe('idle');
  });
});

describe('country hover / selection', () => {
  const FRANCE = { id: '250', name: 'France' };
  const INDIA = { id: '356', name: 'India' };

  it('starts with nothing hovered or selected', () => {
    const g = createToyStore().getState().globe;
    expect(g.hoveredCountry).toBeNull();
    expect(g.selectedCountry).toBeNull();
  });

  it('sets, copies and clears the hovered and selected countries independently', () => {
    const st = createToyStore();
    st.getState().setHoveredCountry(INDIA);
    st.getState().setSelectedCountry(FRANCE);
    expect(st.getState().globe.hoveredCountry).toEqual(INDIA);
    expect(st.getState().globe.hoveredCountry).not.toBe(INDIA);
    expect(st.getState().globe.selectedCountry).toEqual(FRANCE);
    st.getState().setSelectedCountry(null);
    expect(st.getState().globe.selectedCountry).toBeNull();
    expect(st.getState().globe.hoveredCountry).toEqual(INDIA);
  });

  it('notifies only when the country actually changes', () => {
    const st = createToyStore();
    const listener = vi.fn();
    st.subscribe(listener);
    st.getState().setSelectedCountry(FRANCE);
    st.getState().setSelectedCountry({ ...FRANCE });
    st.getState().setHoveredCountry(null);
    expect(listener).toHaveBeenCalledTimes(1);
    st.getState().setHoveredCountry(FRANCE);
    st.getState().setHoveredCountry({ id: '250', name: 'France' });
    expect(listener).toHaveBeenCalledTimes(2);
    st.getState().setSelectedCountry(null);
    st.getState().setSelectedCountry(null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('keeps hover and selection across status and view changes', () => {
    const st = createToyStore();
    st.getState().setHoveredCountry(INDIA);
    st.getState().setSelectedCountry(FRANCE);
    st.getState().setGlobeStatus('ready');
    st.getState().setGlobeView({ lat: 0, lng: 0, distance: 2 });
    expect(st.getState().globe.hoveredCountry).toEqual(INDIA);
    expect(st.getState().globe.selectedCountry).toEqual(FRANCE);
  });
});
