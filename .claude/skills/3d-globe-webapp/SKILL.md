---
name: 3d-globe-webapp
description: "Use when building or changing the Terra Toy 3D globe app: three.js globe, procedural models, content JSON, routes, quizzes."
version: 1.0.0
author: Joji
license: MIT
---

# 3D Globe Webapp (Terra Toy)

Full plan: [`docs/PLAN.md`](../../../docs/PLAN.md). Reference analysis: [`docs/ANALYSIS.md`](../../../docs/ANALYSIS.md).

**When to use:** any PR in this repo that touches `src/engine`, `src/models`, `content/`, `src/game`, or performance.

## Key procedures

1. **Add a landmark:**
   - Create `content/landmarks/<id>.json` (schema in `docs/PLAN.md` §3.2), add a builder at `src/models/landmarks/<model>.ts`, and register it in `src/models/index.ts`.
   - Run `npm run content:validate` (Phase 1) `&& npm test -- models`, then check the result with `npm run dev` at `?focus=<id>`, a debug flag that calls `flyTo` and opens the card.
2. **Add an animal:** pick a rig (Quadruped/Bird/Fish/Special), pass the variant params, give at least 1 spawn circle, and make sure `medium` matches the land/sea mask. The validator rejects land animals placed in the sea.
3. **Add a route/vehicle:** list the waypoints in order and cross the antimeridian by unwrapping longitudes. The route unit test `routes.test.ts` checks every route for NaN and for leg-speed sanity.
4. **Model rules:**
   - Use palette colours only (`src/models/kit.ts` `PALETTE`) and stay within the triangle budgets (≤3,000 landmark / ≤1,200 animal / ≤1,500 vehicle).
   - Name animated parts `anim:*` and do not create a new material per mesh — `bake()` merges them.
5. **Performance checklist before merging:**
   - Check `renderer.info.render.calls` in the debug HUD (`?debug=1`): world view < 150, close-up < 400.
   - Check frame time on a throttled run (`playwright --project=mobile-throttled`).
   - Dispose geometries and materials on unload.
6. **Geo math pitfalls:**
   - `llToVec3` must match `SphereGeometry` UVs.
   - Slerp breaks for antipodal points (pick an intermediate point).
   - At the poles the surface frame needs a fallback north vector.
7. **Testing:**
   - Vitest for pure logic.
   - Playwright smoke with SwiftShader GL (`--use-gl=swiftshader`).
   - Never assert on pixels; assert on store state, such as `window.__toy.store.getState()` exposed in dev and test builds.
   - Headless CDP/browser automation can time out while the main thread is busy with a staged boot — wait for a `window.__toyReady` promise instead of polling the DOM immediately.
8. **Content facts:** every numeric fact needs a `source` URL. Name and blurb are written in our own words — never copy wording from myearthtoy.com or any reference site. Translations are marked `"machineTranslated": true` until a human reviews them.
9. **IP hygiene (important):** this project is inspired by the concept of myearthtoy.com (see `docs/ANALYSIS.md`), but no code, text, translations, content lists, or assets from it are ever copied in. Every model is built from our own procedural code or sourced from public-domain/openly-licensed material with recorded attribution (see `docs/PLAN.md` §5).

## PR convention

One content batch (≈20 items) or one feature per PR, per `docs/PLAN.md` §4 (Build phases). Every PR must pass CI (`typecheck`, `lint`, `validate-content`, `vitest`, `playwright smoke`) and include a short screen recording or screenshot in the PR description.

## References to add as this grows
- `references/geo-math.md` — coordinate/great-circle formulas.
- `references/model-kit.md` — helper API and palette swatches.
- `references/perf-budget.md` — draw-call and triangle budgets, LOD thresholds.
- `templates/landmark.json`, `templates/builder.ts` — copy-paste starting points for new content.
