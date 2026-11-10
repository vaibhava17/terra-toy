/**
 * The model registry: model id → lazy builder import (PLAN §5.1). Keys are cheap to import
 * (builders load on demand); `loadModel` builds, bakes and caches a model per id.
 */
import { Group } from 'three';
import { bake, disposeParts, type BakedModel } from './kit';

export type Builder = (g: Group) => void;
export type BuilderModule = { default: Builder };

export const MODELS: Readonly<Record<string, () => Promise<BuilderModule>>> = {
  'landmarks/big-ben': () => import('./landmarks/big-ben'),
  'landmarks/christ-the-redeemer': () => import('./landmarks/christ-the-redeemer'),
  'landmarks/colosseum': () => import('./landmarks/colosseum'),
  'landmarks/eiffel-tower': () => import('./landmarks/eiffel-tower'),
  'landmarks/great-pyramid-giza': () => import('./landmarks/great-pyramid-giza'),
  'landmarks/great-wall-mutianyu': () => import('./landmarks/great-wall-mutianyu'),
  'landmarks/mount-fuji': () => import('./landmarks/mount-fuji'),
  'landmarks/statue-of-liberty': () => import('./landmarks/statue-of-liberty'),
  'landmarks/sydney-opera-house': () => import('./landmarks/sydney-opera-house'),
  'landmarks/taj-mahal': () => import('./landmarks/taj-mahal'),
};

export const MODEL_IDS: readonly string[] = Object.keys(MODELS);

export function hasModel(id: string): boolean {
  return Object.hasOwn(MODELS, id);
}

/** Runs a builder into a fresh group and bakes it (the unbaked parts are freed). */
export function buildModel(builder: Builder, name = 'model'): BakedModel {
  const g = new Group();
  g.name = name;
  builder(g);
  const baked = bake(g);
  disposeParts(g);
  return baked;
}

const cache = new Map<string, Promise<BakedModel>>();

/**
 * The baked model for `id`, built once and cached (the promise, so concurrent callers
 * share one build). Rejects for unknown ids; a failed load is not cached, so it may retry.
 */
export function loadModel(id: string): Promise<BakedModel> {
  let p = cache.get(id);
  if (!p) {
    const load = MODELS[id];
    if (!load) return Promise.reject(new Error(`Unknown model "${id}"`));
    p = load().then((m) => buildModel(m.default, id));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
