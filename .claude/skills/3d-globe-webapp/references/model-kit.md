# Model kit quick reference

Source: `src/models/kit.ts`. Full helper table and palette: `src/models/README.md`.

## Helpers

`box`, `cyl`, `cone`, `sphere`, `lathe`, `extrude`, `tube`, `ring`, `stairs`, `arch`, `beam`, `base`. Each returns a palette-tagged `Mesh`; pass `{ at, rot, scale, name }` to place it. `box`/`cyl`/`cone`/`ring`/`stairs`/`arch`/`base` stand on their origin; `sphere` is centred; `lathe`, `extrude`, `tube` and `beam` use the coordinates you give. Radial segments are capped at 12.

## Palette

32 named swatches (`stone`, `sandstone`, `marble`, `brick`, `roofRed`, `roofGreen`, `gold`, `iron`, `copper`, `snow`, `rock`, `leaf`, `grass`, `water`, `wood`, `glass`, `clockFace`, …). Use the names; raw hex strings under `src/models/` (outside `kit.ts`) fail lint.

## Budgets

- Triangles after `bake()`: ≤ 3,000 per landmark, ≤ 1,200 per animal, ≤ 1,500 per vehicle.
- One mesh (one draw call) per shown model, plus one per `anim:*` part. World view < 150 calls, close-up < 400.
- LOD (`src/engine/entities/landmarkMath.ts`): models show when the camera distance drops below `MODEL_SHOW_DISTANCE` (2.25) and go back to pins past `MODEL_HIDE_DISTANCE` (2.4). Scale is `clamp(altitude × 0.05, 0.01, 0.08) × content scale`.

## Adding a builder

1. Write `src/models/landmarks/<id>.ts` exporting `default function build(g: Group): void`. Model ≈ 1 unit tall, origin on the ground at the footprint centre, −Z is north/front. Start with `g.add(base(r))`.
2. Register it in `src/models/index.ts`: `'landmarks/<id>': () => import('./landmarks/<id>')`.
3. Set `"model": "landmarks/<id>"` in `content/landmarks/<id>.json` (optionally `"scale"`).
4. Run `npm test -- models content`: budget, NaNs, ground contact, palette only, registry cross-check.
5. Look at it with `npm run dev` at `?focus=<id>`.
