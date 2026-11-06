# Terra Toy: Build Plan for an Interactive 3D Globe for Kids

> Working title: **Terra Toy** (rename freely). Status: planning. Target: a static web app that a coding agent (Claude Code) builds incrementally over many small PRs.

## 1. Summary

We are building an original, free, ad-free, browser-based 3D toy globe for kids aged about 6–12. Kids can spin and zoom a stylised Earth. When they zoom in, they find small low-poly landmarks, animals living in their real habitats, and vehicles moving along real-world routes that they can ride. On top of the globe sit short geography games: a pin-drop "Where is it?" game, a multiple-choice globe quiz, a flag quiz and a daily puzzle. Kids collect stickers and fill an animal dex. The concept comes from [myearthtoy.com](https://myearthtoy.com), but none of its code, models, text or data is reused. Every model, fact card, translation and route in this project is authored by us or comes from public-domain or openly licensed sources with attribution. The app is a static site with no required backend: progress lives in `localStorage`, and optional accounts come later.

See [`ANALYSIS.md`](./ANALYSIS.md) for the full feature inventory of the reference site that this plan is based on.

---

## 2. Recommended tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite 6 + TypeScript (strict)** | Fast dev server, code splitting and dynamic `import()` for lazy model packs; the reference site's main problem is a single 9 MB monolith. |
| 3D | **three.js (latest, r17x) used imperatively** | We render thousands of objects, and an imperative engine with `BatchedMesh`/`InstancedMesh` and a hand-written frame loop is simpler and faster than reconciling them through React. Keep three on `WebGLRenderer` (WebGPU is optional later). |
| Controls | `three/examples/jsm/controls/OrbitControls` wrapped in our own `GlobeRig` (zoom-dependent tilt, inertia, min/max distance) | Proven by the reference site. |
| Lines | `three/examples/jsm/lines/LineSegments2` + `LineMaterial` | Width-controlled borders and routes on mobile; `GL_LINES` is always 1 px. |
| Geo data | `topojson-client`, `d3-geo` (for `geoContains` in hit tests), `world-atlas@2` `countries-50m.json`, Natural Earth lakes/rivers (public domain) | Small, well-licensed sources. |
| UI overlay | **Preact + @preact/signals** (≈5 kB), with HTML/CSS overlays above the canvas | Cards, menus, quiz screens and dex are DOM. The engine never imports Preact; they talk through a store. |
| State | **Zustand vanilla store** (`zustand/vanilla`) shared by engine and UI, plus a persist middleware to `localStorage` | Framework-agnostic; persistence and migrations come built in. |
| i18n | Our own tiny `t(key, vars)` plus per-locale JSON (`/src/i18n/{en,ko,ja,zh,hi}.json`), with content names in the content JSON | No heavy dependencies; content and UI strings are versioned separately. |
| Tests | **Vitest** (unit: geo math, quiz generator, route sampler, schema validation), **Playwright** (smoke test: boot, WebGL canvas present, tap a landmark → card opens) using `--use-gl=swiftshader` | CI-friendly. |
| Content validation | **Zod** schemas plus `scripts/validate-content.ts` run in CI | Catches bad lat/lng, missing translations and missing model refs. |
| Encyclopedia/SEO (Phase 5) | **Astro** sub-project (`/site`) that generates static pages from the same `content/*.json` | Equivalent to the reference site's encyclopedia without coupling it to the app bundle. |
| PWA | `vite-plugin-pwa` (Workbox) | Offline play and add-to-home-screen. |
| Deploy | **Cloudflare Pages** (preferred: free, global CDN, long cache headers on hashed assets, preview deploys per PR) or GitHub Pages | Fully static. |
| Accounts (optional, Phase 5+) | Supabase Auth + one `progress` table with row-level security | Only if cross-device sync is needed. For kids, local-first with no PII is the default. |

**Rejected alternatives:**
- **React Three Fiber + drei**: great for small scenes, but thousands of animated entities plus custom batching fight React's model. drei helpers (`Html`, `Billboard`) are easy to replace.
- **Babylon.js**: a heavier runtime with a smaller example ecosystem for globe and fat-line work.
- **CesiumJS / globe.gl**: built for photoreal or data visualisation, not for a toy with stylised models and ride cameras.

---

## 3. Architecture

### 3.1 Directory structure

```
terra-toy/
├─ index.html
├─ vite.config.ts
├─ package.json
├─ docs/PLAN.md               # this file
├─ docs/ANALYSIS.md           # reference-site feature inventory
├─ public/
│  ├─ textures/earth/            # albedo_4k.webp, albedo_2k.webp, height_2k.png, night_2k.webp, bathy_2k.webp
│  ├─ geo/                       # countries-50m.topo.json, lakes.topo.json, rivers.topo.json
│  ├─ photos/                    # optimised CC/PD photos, <id>.webp (+ credits in content)
│  └─ audio/                     # sfx/*.ogg, bgm/*.ogg (CC0)
├─ content/                      # SOURCE OF TRUTH, human/agent-edited
│  ├─ landmarks/*.json           # one file per landmark (merge-friendly for PRs)
│  ├─ animals/*.json
│  ├─ vehicles/*.json
│  ├─ routes/*.json
│  ├─ discoveries/*.json
│  ├─ countries.json             # iso2, iso3, numeric id, capital, continent, flag emoji/svg ref
│  └─ quiz/manual-questions.json # hand-written questions (auto ones are generated)
├─ scripts/
│  ├─ validate-content.ts        # zod validation + cross-refs + i18n completeness report
│  ├─ build-content.ts           # content/** -> src/generated/content.<locale>.json (+ spatial index)
│  ├─ bake-models.ts             # run builders headless -> footprint/height meta, optional .glb export
│  ├─ fetch-photo.ts             # Wikimedia API -> webp + license/author record
│  └─ textures.ts                # resize/convert NASA sources with sharp
├─ src/
│  ├─ main.ts                    # boot: capability check -> loader -> engine -> ui
│  ├─ engine/
│  │  ├─ Engine.ts               # renderer, scene, frame loop, resize, pixel-ratio policy
│  │  ├─ GlobeRig.ts             # orbit + zoom-tilt camera, flyTo(lat,lng,zoom)
│  │  ├─ globe/Earth.ts          # sphere, materials, atmosphere shader, day/night uniform
│  │  ├─ globe/Lines.ts          # borders/coast/rivers/routes as LineSegments2, LOD sets
│  │  ├─ globe/Labels.ts         # DOM/CSS2D labels with collision culling
│  │  ├─ geo.ts                  # llToVec3, vec3ToLl, greatCircle, haversine, surfaceFrame
│  │  ├─ entities/EntityLayer.ts # placement, visibility culling, LOD switching
│  │  ├─ entities/Landmarks.ts
│  │  ├─ entities/Animals.ts     # idle animation (bob/walk/swim), habitat wander
│  │  ├─ entities/Vehicles.ts    # route playback
│  │  ├─ routes/RoutePlayer.ts   # shuttle/loop/circuit timing, easing, banking
│  │  ├─ ride/RideCamera.ts      # chase/first-person cam, sky dome, ground clamp
│  │  ├─ picking.ts              # GPU-cheap raycast against proxy spheres
│  │  └─ preview/ModelPreview.ts # offscreen renderer for cards/quiz/dex thumbnails
│  ├─ models/                    # PROCEDURAL MODEL LIBRARY (our "hand-modelled" assets)
│  │  ├─ kit.ts                  # helpers: box(), cyl(), cone(), lathe(), tube(), palette, bake()
│  │  ├─ landmarks/eiffel.ts     # export default (g: Group) => void
│  │  ├─ animals/elephant.ts
│  │  ├─ vehicles/ferry.ts
│  │  └─ index.ts                # registry: id -> () => import('./landmarks/eiffel')
│  ├─ game/
│  │  ├─ quiz/QuestionGen.ts     # templates -> questions from content
│  │  ├─ quiz/QuizSession.ts     # players, turns, scoring
│  │  ├─ whereis/WhereIs.ts      # pin-drop scoring
│  │  ├─ flags/FlagQuiz.ts
│  │  ├─ daily/Daily.ts          # seeded daily landmark / rare finds / streak
│  │  └─ rng.ts                  # mulberry32 seeded by YYYY-MM-DD (UTC)
│  ├─ state/store.ts             # zustand vanilla: settings, progress, ui
│  ├─ state/progress.ts          # stickers, dex, records, streak; schema versioned + migrations
│  ├─ i18n/{index.ts,en.json,ko.json,ja.json,zh.json,hi.json}
│  ├─ ui/                        # Preact components
│  │  ├─ App.tsx  Hud.tsx  Menu.tsx  InfoCard.tsx  Dex.tsx  StickerAlbum.tsx
│  │  ├─ quiz/QuizSetup.tsx  quiz/QuizPlay.tsx  quiz/QuizResults.tsx
│  │  └─ whereis/WhereIsHud.tsx
│  └─ generated/                 # build output of scripts/build-content.ts (gitignored)
├─ tests/
│  ├─ unit/geo.test.ts  unit/routes.test.ts  unit/quizgen.test.ts  unit/content.test.ts
│  └─ e2e/smoke.spec.ts
└─ .github/workflows/ci.yml      # typecheck, lint, validate-content, vitest, playwright, deploy preview
```

### 3.2 Data model (Zod schemas; the JSON is shown as an example)

**Shared types**
```ts
// src/content/schema.ts
const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const I18nText = z.object({ en: z.string() }).catchall(z.string()); // en required, others optional
const Credit = z.object({ url: z.string().url(), author: z.string(), license: z.enum(['CC0','PD','CC-BY-2.0','CC-BY-3.0','CC-BY-4.0','CC-BY-SA-3.0','CC-BY-SA-4.0']) });
```

**Landmark** (`content/landmarks/eiffel-tower.json`)
```json
{
  "id": "eiffel-tower",
  "kind": "landmark",
  "category": "tower",
  "pos": { "lat": 48.8584, "lng": 2.2945 },
  "heading": 0,
  "country": "FR",
  "continent": "europe",
  "model": "landmarks/eiffel",
  "scale": 1.0,
  "minZoom": 3,
  "name": { "en": "Eiffel Tower", "ko": "에펠탑", "ja": "エッフェル塔", "zh": "埃菲尔铁塔", "hi": "एफ़िल टॉवर" },
  "blurb": { "en": "An iron lattice tower built for the 1889 World's Fair in Paris." },
  "facts": [
    { "key": "built", "value": "1887–1889", "source": "https://en.wikipedia.org/wiki/Eiffel_Tower" },
    { "key": "height_m", "value": 330, "source": "https://www.toureiffel.paris/en/the-monument/key-figures" }
  ],
  "photo": { "file": "photos/eiffel-tower.webp", "credit": { "url": "https://commons.wikimedia.org/wiki/File:...", "author": "...", "license": "CC-BY-SA-4.0" } },
  "birthday": "1889-03-31",
  "tags": ["iron", "paris", "worlds-fair"],
  "quiz": { "difficulty": 1 },
  "verified": { "by": "human", "date": "2026-11-06" }
}
```

**Animal** (`content/animals/african-elephant.json`)
```json
{
  "id": "african-elephant",
  "kind": "animal",
  "class": "mammal",
  "model": "animals/elephant",
  "variant": { "tusks": true, "earSize": 1.3 },
  "habitat": {
    "type": "savanna",
    "medium": "land",
    "spawns": [ { "lat": -2.33, "lng": 34.83, "radiusKm": 120 }, { "lat": -19.0, "lng": 23.5, "radiusKm": 150 } ]
  },
  "behaviour": { "idle": "walk", "speed": 0.4, "herd": [2, 4] },
  "name": { "en": "African bush elephant", "ko": "아프리카코끼리" },
  "scientific": "Loxodonta africana",
  "iucn": "EN",
  "blurb": { "en": "The largest land animal. It uses its trunk to drink, smell and say hello." },
  "facts": [ { "key": "weight_kg", "value": "up to 6000", "source": "https://www.iucnredlist.org/species/181008073/223031019" } ],
  "photo": { "file": "photos/african-elephant.webp", "credit": { "url": "...", "author": "...", "license": "CC-BY-SA-4.0" } }
}
```
`medium` is one of `land | sea | air | freshwater | ice`. Sea animals render below the water surface with a depth offset and fog tint.

**Route + Vehicle** (`content/routes/dover-calais.json`, `content/vehicles/ferry-dover.json`)
```json
{
  "id": "dover-calais",
  "mode": "sea",
  "path": "greatCircle",
  "waypoints": [ { "lat": 51.12, "lng": 1.33 }, { "lat": 51.05, "lng": 1.60 }, { "lat": 50.97, "lng": 1.86 } ],
  "pattern": "shuttle",
  "dwellSec": 6,
  "drawLine": false,
  "name": { "en": "Dover–Calais ferry" }
}
```
```json
{
  "id": "ferry-dover",
  "kind": "vehicle",
  "type": "ship",
  "model": "vehicles/ferry",
  "route": "dover-calais",
  "speedDegPerSec": 0.2,
  "cruiseAlt": 0,
  "rideable": true,
  "rideCam": { "mode": "chase", "offset": [0, 0.6, -2.2] },
  "name": { "en": "Channel ferry" }
}
```
- `pattern` is one of `shuttle | loop | circuit`. Aircraft use `circuit`: a closed oval at cruise altitude, so they never land.
- `path` is one of `greatCircle | polyline | spline`. Rail and road routes use `polyline` with dense waypoints, simplified per LOD.

**Discovery / Quiz / Progress**
```json
{ "id": "titanic-wreck", "kind": "discovery", "category": "shipwreck", "pos": { "lat": 41.73, "lng": -49.95 }, "hidden": true, "revealZoom": 6, "model": "discoveries/wreck-liner", "name": { "en": "RMS Titanic wreck" } }
```
```json
{ "id": "q-manual-001", "type": "mcq", "topic": "oceans", "difficulty": 2, "prompt": { "en": "Which is the largest ocean?" }, "answer": "pacific", "options": ["pacific", "atlantic", "indian", "arctic"], "explain": { "en": "The Pacific covers about a third of Earth's surface." }, "source": "https://oceanservice.noaa.gov/facts/pacific.html" }
```
```ts
// state/progress.ts (persisted as localStorage['terra-toy:progress:v1'])
type Progress = {
  v: 1;
  found: Record<string, number>;      // entityId -> first-found epoch ms (drives dex + stickers)
  stickers: string[];
  records: { whereis: Record<'easy'|'normal'|'hard', number>; quiz: Record<string, number>; flags: number };
  daily: { lastDay: string; streak: number; stamps: Record<string, string[]> }; // YYYY-MM-DD -> stamp ids
  rides: string[];
};
```

### 3.3 Rendering approach
- **Coordinates:** use a unit sphere (R = 1). `llToVec3(lat,lng,r)` must match `SphereGeometry` UVs (x = −cos φ cos(λ+180°), y = sin φ, z = cos φ sin(λ+180°)). `surfaceFrame(lat,lng)` returns a quaternion with up equal to the normal and north as forward, and every entity is oriented with it. Write one unit test that round-trips 1,000 random points.
- **Earth:** a 128×64 `SphereGeometry` with these materials:
  - `MeshStandardMaterial`.
  - Albedo: our own stylised texture, baked offline in `scripts/textures.ts` from NASA Blue Marble plus a Natural Earth land mask, recoloured into a flat toy palette.
  - Water: a separate shininess mask.
  - Night lights: added in `onBeforeCompile`, masked by `dot(normal, sunDir)`. The sun direction comes from UTC time (a simple solar declination and hour-angle formula in `engine/sun.ts`).
  - Atmosphere: a back-side Fresnel shader shell at r = 1.03.
- **Entity scale:** models are authored in "landmark units" and scaled by `k = clamp(camHeight * 0.06, min, max)` so they stay readable at every zoom. This matches the toy feel instead of real scale.
- **Culling and LOD, per frame on a budget:**
  1. Back-face/horizon cull: hide the entity if `dot(n, camDir) < horizon`.
  2. A distance tier picks between `hidden`, `icon` (instanced billboard dot or emoji sprite), `snapshot` (merged static mesh) and `live` (animated). The thresholds use screen-space size in px, like the reference site's 18/24 px hysteresis.
  3. Spatial index: a cube-sphere grid with 6 faces of 32×32 cells, so the culling query only touches the cells near the view.
- **Draw calls:**
  - Every procedural model runs through `bake()`: material colours go into vertex colours, geometries are merged per material "look", and the result is cached per model ID.
  - Static landmarks visible at the same time go into one `BatchedMesh` per look.
  - Repeated scenery (trees, rocks, waves) uses `InstancedMesh`.
  - Target: **under 150 draw calls** at world view and **under 400** when zoomed in.
- **Picking:** each entity has an invisible proxy sphere in a flat array. Raycast the ray against the proxies with a manual sphere test, which is O(n) on the visible subset only. A tap fires on pointerup when movement is under 6 px.
- **Labels:** DOM labels positioned in one rAF pass, with greedy rectangle collision removal by priority (country > landmark > animal).
- **Model previews:** one shared offscreen `WebGLRenderer` that renders to `ImageBitmap` for cards, dex and quiz. Cache the results in an LRU of 64.

### 3.4 Vehicle routing and animation
- `RoutePlayer` precomputes each leg:
  - `greatCircle` legs: slerp between unit vectors, with arc length = `acos(dot(a,b))`.
  - `polyline`/`spline` legs: build an arc-length table (`CatmullRomCurve3.getSpacedPoints` projected back onto the sphere).
- **Time to position:** `t` maps to `(legIndex, u)` with smoothstep easing over the first and last 8% of each leg, plus dwell segments. Everything is deterministic from `performance.now()` with a per-vehicle phase offset seeded by `hash(id)`, so vehicles are spread out and can resume after a pause.
- **Orientation:** forward is the tangent (the derivative of position), up is the surface normal. Aircraft also bank by roll = clamp(k · turnRate), smoothed with quaternion slerp(0.15).
- **Circuit pattern for aircraft:** offset the outbound and return paths by ±0.5° laterally and join them with semicircular turns. Altitude = `cruiseAlt * k`.
- **Ride mode:** `RideCamera` attaches a chase or first-person camera to the vehicle's frame and lerps the camera position.
  - A sky dome (a `ShaderMaterial` back-side sphere) fades in as altitude falls.
  - The ground clamp raycasts against the height texture CPU-side (a sampled `height_2k` array) instead of against meshes.
  - Exiting flies the camera back to orbit with `GlobeRig.flyTo`.
- Speeds come from a table, `VSPEED = { ship: 0.2, boat: 0.08, jet: 1.2, prop: 0.6, heli: 0.3, train: 0.25, car: 0.08 }` (deg/s), and can be overridden per vehicle.

### 3.5 Quiz and game engine
- **QuestionGen.ts**: template functions over the content index. Each template returns `{prompt, options, answerId, visual: {modelId|photo|flag}, explain}` or null if there is not enough data.
  - `whichCountryIsLandmark` (options are 3 distractors from the same continent)
  - `whichContinentAnimal`
  - `whichIsTallest` (uses `facts.height_m`)
  - `flagToCountry`
  - `oceanLargest` (manual)
  - `animalMedium` ("Which one lives in the sea?")
  - Plus `manual-questions.json`.
  - Generation is seeded (`rng(seed)`). Avoid repeating a template more than twice per 10 questions, and balance topics by weight.
  - Difficulty filters use `quiz.difficulty` and the popularity rank.
- **QuizSession.ts**: a pure state machine `setup → turn(playerIdx) → answer → reveal → next → results`. It supports 1–4 players with a pass-the-device interstitial. Scoring: +100 if correct, plus a speed bonus `max(0, 50 − secondsTaken*5)`. The engine never touches the DOM; the UI subscribes to it.
- **WhereIs.ts**: shows the target's model in the preview, hides all landmark markers and labels, and lets the player drop a pin on the globe.
  - `score = round(1000 * exp(-distanceKm / D))` with D = 2000 (easy), 1000 (normal) or 400 (hard).
  - Practice mode keeps country labels and offers a hint ladder: continent, then country, then a zoomed hint ring.
- **Daily.ts**: `seed = hash('daily:' + YYYY-MM-DD UTC)`. It picks today's landmark (excluding the last 60 days) and 3 rare finds (discoveries that get a special glow).
  - Streak: if `lastDay` was yesterday, add 1; otherwise reset to 1.
  - The share text is emoji squares, Wordle-style, and carries no URL tracking.
- **Rewards:** every game emits `reward(stickerId)` events into `progress.ts`, which shows a toast and haptic feedback (`navigator.vibrate?.(30)`).

---

## 4. Build phases and milestones

Each bullet is roughly one PR. Every PR must pass CI (`typecheck`, `lint`, `validate-content`, `vitest`, `playwright smoke`) and include a short-video or screenshot note in the PR description.

### Phase 0: Scaffold (2–3 PRs)
- Vite + TS + Preact + Zustand + Vitest + Playwright + ESLint/Prettier. Add the CI workflow and a Cloudflare Pages preview deploy.
- `geo.ts` with tests: ll↔vec3, haversine, great-circle interpolation, surface frame.
- A WebGL capability check with a friendly fallback screen, and the loading screen.

### Phase 1: MVP globe + 10 landmarks (6–8 PRs)
- `Engine`, `GlobeRig` (orbit, inertia, zoom-tilt, `flyTo`), zoom buttons, fullscreen, reset view.
- Earth materials: stylised albedo, sea gloss, atmosphere. Generate 4K and 2K textures and pick by `devicePixelRatio`/`navigator.deviceMemory`.
- Borders and coastlines with fat lines plus LOD, and a country hover/tap highlight.
- The content pipeline: Zod schemas, `validate-content`, `build-content`.
- Procedural model kit (`kit.ts`, `bake()`) and the first **10 landmark builders**.
- EntityLayer: placement, horizon cull, scale-by-zoom, icon↔live LOD, picking, and an `InfoCard` with photo and credit.
- **Exit criteria:** 60 fps on a mid-range laptop, ≥ 40 fps on a 2021 mid-range Android, under 3 MB transferred on first load, Lighthouse PWA/perf ≥ 85.

### Phase 2: Animals (5–6 PRs)
- Animal kit: shared rigs (quadruped, bird, fish, snake) with parametric proportions, so one builder covers many species.
- Habitat spawning (seeded scatter inside `spawns` circles, constrained to land or sea using the land mask), plus an idle wander/swim/fly animation via vertex-free group transforms.
- Underwater rendering for `medium: sea` (depth offset plus a tint shader), and lazy-load animal model chunks by spatial cell.
- Dex UI with first-find pop-ups and progress persistence.
- 20 animals (list in §5), then expand to 60.

### Phase 3: Vehicles and routes (5–7 PRs)
- `RoutePlayer` with unit tests (leg timing, easing, shuttle/loop/circuit continuity, no NaN at the poles or the antimeridian).
- Vehicle builders for 8 types (ship, ferry, sailboat, jet, prop plane, helicopter, train, car/truck).
- Rail and road line layers shown with the vehicles.
- Ride mode: chase and first-person cameras, sky dome, ground clamp, exit fly-back, Ride button. Mobile UX: tap the vehicle, then tap "Ride".
- 15 routes to start (list in §5).

### Phase 4: Games, quizzes and collectibles (6–8 PRs)
- Quiz engine (`QuestionGen` + `QuizSession`) with full unit coverage, plus Setup/Play/Results UI for 1–4 players.
- Where-is-it game with 3 difficulties and practice mode.
- Flag quiz using flag SVGs from `flag-icons` (MIT) or our own simplified SVGs.
- Daily landmark, 3 rare finds, stamps and streak.
- Sticker album with tabs (Landmarks, Animals, Vehicles, Discoveries, Events) and sorting.
- 10 hidden discoveries (shipwrecks, legends) with a reveal-on-zoom effect.

### Phase 5: i18n, polish, reach (6–10 PRs)
- i18n plumbing: UI strings plus content names/blurbs, a locale picker, and a fallback to `en` with a CI completeness report. Launch with **en + hi + ko + ja + zh**. Hindi is a natural first non-English locale for us; others can be added later.
- Day/night with real sun position, night lights, and floodlit landmarks (emissive vertex-colour channel).
- Sound: CC0 SFX and BGM with toggles, plus haptics.
- PWA offline mode and an add-to-home-screen prompt after the first quiz.
- Photo mode (canvas `toBlob` → album in IndexedDB → `navigator.share`).
- Guided first-run tour (4 steps).
- Astro encyclopedia site generated from `content/`, with sitemap and hreflang.
- Accessibility: keyboard globe controls (arrows to rotate, +/- to zoom), `prefers-reduced-motion`, colour-blind-safe political palette, minimum 44 px tap targets.

### Later / optional
- Moon scene with NASA CGI Moon Kit textures.
- Seasonal events driven by a dated `content/events/*.json`.
- Optional Supabase sync, school mode, and a teacher page.

---

## 5. Asset strategy

### 5.1 3D models: "models as code" (primary)
The reference site shows that a toy globe does not need photoreal meshes. **Every model is a TypeScript builder** that composes three.js primitives with a shared palette. This works well for a coding agent:
- Changes are diffable and reviewable in PRs.
- There are zero licensing questions, because we write every model ourselves.
- Models are tiny on the wire: a builder is 1–4 kB gzipped compared with 50–500 kB for a GLB.
- Size and colours can be tweaked parametrically.

**Kit conventions** (`src/models/kit.ts`):
- Units: 1 unit = the default landmark height. The origin sits on the ground at the footprint centre. +Y is up and −Z is "north/front".
- Use only the helpers `box`, `cyl`, `cone`, `sphere(lowSeg)`, `lathe(profile)`, `extrude(shape, depth)`, `tube(points, r)`, `ring`, `stairs` and `arch`. Segment counts are capped (`radialSegments ≤ 12`).
- Colours must come from the `PALETTE` (about 32 named swatches, such as `stone`, `brick`, `roofRed`, `gold`, `leaf`, `water`). Raw hex values are not allowed (enforced by lint), so the art style stays consistent.
- Budget: **≤ 3,000 triangles per landmark, ≤ 1,200 per animal, ≤ 1,500 per vehicle**. A CI test runs `bake()` on every builder and fails if a model goes over budget.
- Animated parts (wheels, propellers, legs, flags) are named children (`anim:prop`, `anim:legFL`), so the animator can find them and the snapshot LOD can freeze them.

**Secondary path** (for hero models only):
- Blender low-poly, exported with `gltf-transform optimize --compress meshopt`. Keep the `.blend` source in `assets-src/` (Git LFS).
- AI 3D generators (Meshy, Tripo, Rodin) are allowed **only** if:
  1. the output licence permits commercial and open use on our plan tier (check the ToS at generation time, record it in `assets-src/LICENSES.md`);
  2. the prompt does not reproduce a copyrighted design (generic animals and vehicles are fine; avoid branded vehicles and characters);
  3. the mesh is decimated to the budget above and recoloured to the palette.
- Never import models from myearthtoy.com, and avoid "free" model sites that use unclear or NC licences. Sketchfab CC-BY is acceptable with attribution; CC0 packs from Kenney or Quaternius are fine.

### 5.2 Other assets
| Asset | Source | Licence |
|---|---|---|
| Earth imagery | NASA Blue Marble Next Generation, NASA Black Marble (night), GEBCO/ETOPO bathymetry | Public domain (NASA); GEBCO is free with attribution |
| Vectors | Natural Earth (countries, lakes, rivers, roads, railroads); `world-atlas` TopoJSON | Public domain; ISC |
| Moon | NASA SVS CGI Moon Kit (LRO colour and LOLA height) | Public domain |
| Photos | Wikimedia Commons via API (`scripts/fetch-photo.ts` records author, licence and URL into the JSON) | CC-BY / CC-BY-SA / PD, with attribution shown on the card and on `/credits` |
| Flags | `flag-icons` (MIT), or regenerate from Wikimedia SVGs (mostly PD) | MIT / PD |
| Fonts | Baloo 2 or Fredoka (display), Nunito (UI), Noto Sans for KR/JP/SC/Devanagari | OFL |
| Audio | Kenney audio packs, freesound.org (CC0 only), our own BGM | CC0 |
| Facts | Our own wording, checked against Wikipedia, official sites, IUCN Red List, NOAA and Britannica. The source URL is stored per fact. | Our text |

### 5.3 Starter content

**First 20 landmarks** (spread across continents; several are cheap to build from primitives):

| # | id | lat, lng | build hint |
|---|---|---|---|
| 1 | eiffel-tower | 48.8584, 2.2945 | 4 tapered lattice legs (boxes) + 2 platforms + spire |
| 2 | statue-of-liberty | 40.6892, −74.0445 | pedestal boxes, lathe robe, arm + torch, crown spikes |
| 3 | great-pyramid-giza | 29.9792, 31.1342 | cone(4 radial segments) ×3 |
| 4 | taj-mahal | 27.1751, 78.0421 | plinth, box hall, onion dome (lathe), 4 minarets |
| 5 | great-wall-mutianyu | 40.4319, 116.5704 | tube-swept wall along a spline + watchtowers |
| 6 | mount-fuji | 35.3606, 138.7274 | lathe cone with a snow-cap vertex colour |
| 7 | sydney-opera-house | −33.8568, 151.2153 | lathe shells, rotated and clipped, on a podium |
| 8 | christ-the-redeemer | −22.9519, −43.2105 | cylinder body + box arms on a cone mountain |
| 9 | big-ben | 51.5007, −0.1246 | tall box + clock faces + spire |
| 10 | colosseum | 41.8902, 12.4922 | elliptical ring of arch segments |
| 11 | machu-picchu | −13.1631, −72.5450 | terraced steps + peak cone |
| 12 | petra-treasury | 30.3222, 35.4519 | façade box with columns on a rock block |
| 13 | angkor-wat | 13.4125, 103.8670 | stepped base + 5 lotus towers (lathe) |
| 14 | burj-khalifa | 25.1972, 55.2744 | stacked setback cylinders + spire |
| 15 | golden-gate-bridge | 37.8199, −122.4783 | 2 towers + catenary tubes + deck |
| 16 | moai-rapa-nui | −27.1258, −109.2770 | 5 blocky heads |
| 17 | india-gate | 28.6129, 77.2295 | arch block |
| 18 | stonehenge | 51.1789, −1.8262 | ring of boxes + lintels |
| 19 | kilimanjaro | −3.0674, 37.3556 | flat-topped lathe cone + snow |
| 20 | gyeongbokgung | 37.5796, 126.9770 | hanok roof (extruded curve) on a pillared hall |

**First 20 animals** (choose rigs: Q = quadruped, B = bird, F = fish/marine, S = special):

| # | id | habitat seed (lat, lng) | medium | rig |
|---|---|---|---|---|
| 1 | african-elephant | −2.33, 34.83 (Serengeti) | land | Q |
| 2 | lion | −2.15, 34.68 | land | Q |
| 3 | giraffe | −1.5, 35.1 (Maasai Mara) | land | Q (long neck) |
| 4 | giant-panda | 31.0, 103.4 (Sichuan) | land | Q (chunky) |
| 5 | bengal-tiger | 21.95, 89.18 (Sundarbans) | land | Q |
| 6 | kangaroo | −25.0, 134.0 | land | S (hopper) |
| 7 | koala | −28.0, 153.0 | land | S (in tree) |
| 8 | emperor-penguin | −75.0, 145.0 | ice | B (waddle) |
| 9 | polar-bear | 78.2, 15.6 (Svalbard) | ice | Q |
| 10 | blue-whale | −45.0, 170.0 (S. Pacific) | sea | F |
| 11 | green-sea-turtle | −16.5, 146.0 (Great Barrier Reef) | sea | F |
| 12 | great-white-shark | −34.6, 19.3 (Gansbaai) | sea | F |
| 13 | bottlenose-dolphin | 26.0, −80.0 | sea | F |
| 14 | bald-eagle | 58.3, −134.4 (Alaska) | air | B |
| 15 | american-bison | 44.6, −110.5 (Yellowstone) | land | Q |
| 16 | jaguar | −3.4, −62.2 (Amazon) | land | Q |
| 17 | scarlet-macaw | −12.8, −69.3 (Peru) | air | B |
| 18 | galapagos-tortoise | −0.74, −90.3 | land | S |
| 19 | camel-dromedary | 23.4, 12.0 (Sahara) | land | Q (hump) |
| 20 | snow-leopard | 35.9, 76.5 (Karakoram) | land | Q |

**First 15 routes**: Dover–Calais ferry; Staten Island ferry; London–Paris high-speed train (via the Channel Tunnel, polyline); Tokyo–Osaka bullet train; Trans-Siberian (Moscow–Vladivostok, simplified); Mumbai–Delhi train; Route 66 car (Chicago–Santa Monica); Australian road train (Adelaide–Darwin); Panama Canal container ship; Suez Canal container ship; Atlantic jet circuit (JFK–LHR); Pacific jet circuit (LAX–HND); Sydney seaplane; Hawaiian inter-island prop plane; Antarctic icebreaker (Ushuaia–Antarctic Peninsula).

---

## 6. Open questions and risks

| Risk / question | Notes / mitigation |
|---|---|
| **IP proximity to myearthtoy.com** | Use our own name, branding, palette, models, text and UI layout. Do not copy their content lists or their fact or translation strings (their bundle contains all of these; do not scrape it). Concepts and game mechanics (globe, pin-drop game, quiz) are not protectable, but expression is. Write our own landmark selection and blurbs. |
| **Landmark likeness and trademark** | Some buildings have trademarked appearances, for example the Eiffel Tower night illumination, and certain modern buildings and logos. A stylised toy model is generally low-risk, but avoid logos and trade names on vehicles (say "jumbo jet", not a branded airline livery). |
| **Photo licences** | CC-BY-SA requires attribution and share-alike for the photo itself only. Show credits on the card and on a `/credits` page, and store licence metadata per photo. If unsure, skip the photo and use a 3D preview. |
| **Kids' privacy (COPPA, GDPR-K, India's DPDP Act 2023)** | Default to no accounts, no analytics cookies and no PII. If analytics are needed, use cookieless aggregate analytics (Cloudflare Web Analytics). Any future accounts need a parental-consent flow, which is a reason to postpone Supabase. |
| **Mobile performance** | The reference site ships about 11 MB of JS and still needs snapshot LOD. We code-split model chunks per spatial region, and budget 3 MB for the first load and 12 MB in total. 2K textures and a DPR cap of 1.5 on low-memory devices (`navigator.deviceMemory <= 4`). Test on a real low-end Android by the end of Phase 1. |
| **Model build cost at scale** | Running 800 procedural builders at runtime blocks the main thread; the reference site yields in chunks and still freezes headless tools. Build lazily per visible cell, yield via `scheduler.yield()`/`requestIdleCallback`, and consider pre-baking to meshopt GLB at build time (`scripts/bake-models.ts`) once there are more than 200 models. |
| **Fat lines on low-end GPUs** | `LineMaterial` costs per segment. Simplify by LOD, and merge all borders into one `LineSegments2`. |
| **Quiz content accuracy** | Every fact carries a source. CI fails on missing sources. Do a human review pass per batch of 20 items. Auto-generated questions only use verified numeric fields. Watch for disputed borders and names (Taiwan, Kashmir, Crimea, the Sea of Japan/East Sea); the policy is a neutral display with no political colouring of disputed areas. |
| **Translation quality** | Machine translations are flagged, and native-speaker review comes before a locale is marked "complete". CJK and Devanagari fonts are large, so subset them with `glyphhanger` or load per locale. |
| **Antimeridian and pole bugs** | Routes and polygons crossing ±180° need unwrapping, and frames at the poles need a fallback. Both are covered by unit tests. |
| **Headless testing of WebGL** | SwiftShader is slow. Keep e2e to a smoke test plus state assertions, and move most logic into pure, unit-tested modules. |
| **Scope creep** | The reference has 830 landmarks and 470 animals after months of near-daily updates. Our MVP target is 10 landmarks, Phase 2 adds 20 animals, and growth then happens in content batches of 20, each with its own PR. |
| **Open decisions** | Name and domain. Launch locales (is Hindi first?). Cloudflare Pages or GitHub Pages. Whether we ever need accounts. Whether the encyclopedia/SEO site is in scope for v1. |
