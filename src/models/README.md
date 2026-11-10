# Procedural models ("models as code")

Every 3D model in Terra Toy is a TypeScript builder that composes three.js primitives. Nothing is imported from other sites. Full rules: `docs/PLAN.md` §5.1; quick reference: `.claude/skills/3d-globe-webapp/references/model-kit.md`.

- **Builder shape:** `export default function build(g: Group): void` in `landmarks/<id>.ts`, registered in `index.ts` as a lazy `() => import('./landmarks/<id>')` under the id `landmarks/<id>` (the content JSON's `model` field).
- **Units and axes:** 1 unit ≈ the model's height. The origin sits on the ground at the footprint centre. +Y is up, −Z is north/front, matching `surfaceFrame()` in `src/engine/geo.ts`.
- **Loading:** `loadModel(id)` imports the builder, builds it into a `Group`, bakes it and caches the result per id. The engine (`src/engine/entities/LandmarkModels.ts`) calls it when the camera first comes close to a landmark.
- **Triangle budgets:** ≤ 3,000 per landmark, ≤ 1,200 per animal, ≤ 1,500 per vehicle. `tests/unit/models.test.ts` bakes every builder and checks the budget, NaNs, ground contact and palette colours.
- **Animation:** animated parts are named children (`anim:prop`, `anim:legFL`, …); `bake()` keeps each one as its own mesh.

## Kit API (`kit.ts`)

Every helper returns a `Mesh` tagged with a palette swatch, and takes optional `PartOpts` `{ at, rot, scale, name }` (`rot` is applied Z, then X, then Y: tip first, yaw last).

| Helper                                                      | Shape                                                               | Origin          |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| `box(w, h, d, swatch)`                                      | box                                                                 | bottom centre   |
| `cyl(rTop, rBottom, h, swatch, { segments })`               | (tapered) cylinder; 4 segments + yaw π/4 = square taper             | bottom centre   |
| `cone(r, h, swatch, { segments })`                          | cone; 4 segments = pyramid                                          | bottom centre   |
| `sphere(r, swatch, { lowSeg })`                             | low-poly sphere                                                     | centre          |
| `lathe(profile, swatch, { segments, phiStart, phiLength })` | `[radius, y]` profile spun around +Y; `phiLength < 2π` = open shell | profile coords  |
| `extrude(outline, depth, swatch, { holes })`                | XY outline extruded along Z, centred on z = 0                       | outline coords  |
| `tube(points, r, swatch)`                                   | round tube along a smooth curve                                     | absolute points |
| `ring(inner, outer, h, swatch)`                             | hollow cylinder                                                     | bottom centre   |
| `stairs(steps, w, h, d, swatch)`                            | flight of steps rising toward +Z                                    | bottom centre   |
| `arch(w, h, depth, swatch, { opening })`                    | wall panel with a round-topped opening                              | bottom centre   |
| `beam(a, b, t, swatch, depth)`                              | bar from point a to b, cross-section kept upright                   | absolute points |
| `base(r, swatch = 'grass')`                                 | the diorama ground disc, top at `BASE_HEIGHT`                       | bottom centre   |

Radial segments are clamped to ≤ 12 (`clampSegments`). `bake(group)` returns `{ object, geometries, triangles, min, max }`: all static parts merged into one vertex-coloured geometry (mesh `baked`) plus one mesh per `anim:*` part, all sharing `getBakedMaterial()`. `triangleCount(geometry)` counts triangles.

## Palette

Only `kit.ts` holds colour values; anywhere else under `src/models/` a hex string is a lint error. Swatches:

`white`, `cream`, `ink`, `stone`, `stoneDark`, `sandstone`, `marble`, `brick`, `terracotta`, `roofRed`, `roofGreen`, `roofBlue`, `slate`, `gold`, `iron`, `copper` (verdigris), `copperDark`, `snow`, `ice`, `rock`, `rockDark`, `leaf`, `leafDark`, `grass`, `sand`, `water`, `waterDeep`, `wood`, `glass`, `clockFace`, `flame`, `tile`, `volcano` (blue-grey, Mount Fuji).
