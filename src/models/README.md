# Procedural models ("models as code")

Every 3D model in Terra Toy is a TypeScript builder that composes three.js primitives. Nothing is imported from other sites. Full rules: `docs/PLAN.md` §5.1. The kit (`kit.ts`) and the first builders land in Phase 1.

- **Builder shape:** `export default (g: Group) => void`, registered in `index.ts` as a lazy `() => import(...)`.
- **Units and axes:** 1 unit = the default landmark height. The origin sits on the ground at the footprint centre. +Y is up, −Z is north/front, matching `surfaceFrame()` in `src/engine/geo.ts`.
- **Helpers only:** `box`, `cyl`, `cone`, `sphere(lowSeg)`, `lathe`, `extrude`, `tube`, `ring`, `stairs`, `arch`, with `radialSegments ≤ 12`.
- **Colours:** named `PALETTE` swatches only. No raw hex values (lint-enforced).
- **Triangle budgets:** ≤ 3,000 per landmark, ≤ 1,200 per animal, ≤ 1,500 per vehicle. A CI test runs `bake()` on every builder.
- **Animation:** animated parts are named children (`anim:prop`, `anim:legFL`, …).
- **No per-mesh materials:** `bake()` merges by look into vertex colours.
