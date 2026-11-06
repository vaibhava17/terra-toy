# Reference Analysis: myearthtoy.com

Researched 2026-11-06. Source material: the live site HTML, its two JS bundles (`/js/s1.<hash>.js` ≈ 9.3 MB and `/js/s2.<hash>.js` ≈ 1.6 MB), `/about`, `/updates` (changelog 5 Oct – 6 Nov 2026), `/games/`, and the page's JSON-LD `featureList`.

Headline numbers from the site: **830+ landmarks, 470+ animal species, 180+ moving vehicles, 170+ "mysteries"**. The encyclopedia has 825 landmark pages, 469 animal pages and 171 discover pages.

This document is pure observation — it is the basis for `PLAN.md`, not something we copy from. No code, models, text, translations or content lists from myearthtoy.com are reused anywhere in this repo.

## Core Globe
- A 3D Earth that you spin and zoom with OrbitControls (mouse, touch, pinch), plus on-screen **+ / − zoom buttons**, a **zoom-level readout** (`×1.0`), **fullscreen**, and a **reset view** button (`↩️`).
- A camera "rig": the real camera is derived from a virtual rig every frame and **tilts toward the horizon as you zoom in**. The key light follows the viewer and aims at the point you are looking at, so close-ups are lit from the front.
- Earth surface:
  - Sea: a glossy `MeshStandardMaterial` with a ripple bump map.
  - Land: a **procedurally generated biome texture** (ice, snow, rock, forest, grass, steppe, dry, sand, tundra), driven by elevation and blended at the borders.
  - Imagery: NASA Blue Marble, a bathymetry map, a topology/height PNG and a night-lights texture. Each comes in 4K and `_2k` variants for low-end devices.
- Atmosphere glow that fades as you zoom in.
- **Country borders, coastlines, lakes, rivers, roads and railways** drawn as fat lines (three.js `LineSegments2`/`LineMaterial`) from TopoJSON (`topojson-client`). Lines get **level-of-detail simplification** (Douglas–Peucker, per camera height).
- **Political map mode** toggle: greedy 7-colouring of countries, so neighbours never share a colour.
- Toggles in the settings menu: map mode, place names/labels, lat/long **grid**, **shadows**, **day/night**, landmarks, animals, mysteries, "minis", vehicles, SFX, background music, and language.
- **Real-time day/night**: a terminator line, city lights, glowing windows and floodlit landmarks after sunset.
- **Ocean and region labels** in several languages.
- **Moon**: zoom all the way out and tap the Moon, which shows today's real phase. It is a separate explorable body built on NASA Moon colour and height maps, with 35 spots (Apollo, Chang'e, Chandrayaan landers and so on) and a "Moon log".
- **Clouds** that you can fly through, generated differently on each visit.
- **Screensaver** mode.
- **Photo mode**: shutter with a flash effect, a local photo album (view, save, share, delete), and photo zoom.
- A playful loading screen with a spinning globe, and a **one-minute guided tour** for first-time visitors.

## Content / Landmarks
- **830+ landmarks**, built in code from three.js primitives rather than loaded as GLB files (see Tech below). Every landmark has a key such as `eiffel`, `taj`, `eu_stpeters`, `a2_fushimi` or `am_empire`.
- Tapping a landmark opens an **info card**: photo (Wikimedia Commons, loaded lazily from hashed "photo packs" `data/photopacks/pN.json`), a short description, and facts checked against sources (the site links Wikipedia per item). The card also has a **3D preview** rendered by a second offscreen renderer.
- **Landmark birthdays**: a `BDAY` table with dates such as "Eiffel inaugurated 1889-03-31", which triggers festival effects on those days.
- Seasonal decoration of landmarks:
  - Halloween: bats and ghosts at Bran Castle, orange/purple glow.
  - Christmas: snow and lights on Neuschwanstein and the Eiffel Tower.
- "Minis": small scenery props, such as trees in several procedural variants.
- **Explore & Discover / mysteries (170+)**: shipwrecks, legends, legendary creatures, extreme places and hidden spots.
- **Encyclopedia**: static SEO pages for every landmark, animal and discovery, plus flags, countries, rankings, a quiz-question bank, "On this day" and site search (`/search/?q=`).

## Animals
- **470 species** placed in their real habitats, with a facts block (location, description) in every language.
- **Sea animals swim under the water**.
- Animals are animated. The animal models **download only when you meet them** (lazy loaded).
- The **animal dex** is a collectible list. A dex pop-up appears the first time you find a species.
- "Sparkling animals" on world days, such as World Wildlife Day.

## Vehicles / Routes
- **180+ vehicles** of these types: `ship`, `mid` (mid-size ship), `boat`, `jet`, `jet2`, `prop`, `heli`, `train`, `snow` (snow vehicle), `car`, plus trucks, road trains and buses (`bus_latam`).
- Each type has its own cruising speed in degrees per second, for example ship 0.2, jet 1.2, train 0.25, car 0.08.
- Route modes:
  - **Shuttle**: wait at A, go A→B, wait at B, go B→A.
  - **Loop**: go round the waypoints, waiting at stops.
- Legs follow **great circles** and ease in and out.
- **Aircraft never land**. They fly a closed circuit at cruise height, banking into turns.
- **Railways and roads drawn on the map** together with their vehicles. Examples: a Trans-Indonesia road, road trains on famous roads.
- **Ride mode**: a "Ride" button gives a first-person or chase camera. A day-sky dome fades in, you can fly through clouds, and the camera is ground-clamped with a raycaster (a changelog fix mentions the truck view sinking into the ground).
- Moon rides: Apollo 13, Artemis II, Danuri and a Moon rover.

## Games / Quizzes
- **Where is it?** (GeoGuessr for kids): a toy landmark model appears on an empty globe, and the player drags a pin to where it belongs. Closer guesses score more points.
  - Difficulty levels: easy, normal, hard.
  - **Practice mode** with country names and hints.
  - Records, a share button and sticker rewards.
- **Globe quiz**: 10 multiple-choice questions, freshly generated from the content on the globe.
  - Topic sets: animals, landmarks, nature/oceans, records, flags.
  - **1–4 players, taking turns on one device** ("pass to player N" screen), with a podium and results table at the end.
  - Each question shows a 3D model or photo and explains a fact after you answer.
- **Flag quiz**: easy mode uses famous flags; the full mode uses all of them.
- **Today's Landmark**: one mystery landmark per day, the same for everyone. Find it in as few guesses as you can, then share your score Wordle-style.
- **On this day**: one history story per day, with a place to visit and a quick question.
- Seasonal quiz sets: a Halloween quiz and a Christmas quiz.
- Seasonal hunts: 10 jack-o'-lanterns or 10 hidden gifts, with hints shown in "Today on Earth".

## Progression / Collectibles
- **Sticker album** with tabs and sorting, covering landmarks, animals, discoveries, and Event/Travel stickers.
- **Explorer's collection**: mysteries, shipwrecks, legends and extreme places.
- **Daily Earth**: 3 rare finds hidden each day, **3 daily stamps** and a **daily streak**.
- Festival days: New Year fireworks, landmark birthdays.
- **Activity log**.
- **Accounts are optional**. Sign in with Supabase plus Google; progress is synced one row per account and merged with local records (counts take the larger value, lists are joined).
- Newsletter opt-in, off by default.
- **School mode** plus a **Teachers' guide** page and a "school link" that merges records.
- Community board (Discord) and a guestbook.
- Sharing via `navigator.share`, with a "take-home card".
- PWA: service worker `/sw.js`, `manifest.webmanifest`, and an "add to home screen" prompt after a quiz.
- Haptics via `navigator.vibrate`. SFX and BGM through Web Audio (`data/music/`).

## i18n
- UI and content in **English, Korean, Japanese, Chinese (Simplified) and Bahasa Indonesia**. Indonesian covers 1,700+ place and animal names.
- Ocean names are also available in es, fr and de.
- Locale-prefixed static pages (`/ko/updates/`, `/ko/encyclopedia/`) and a language picker.
- Fonts: Jua (Korean display), Nunito, Noto Sans KR, IBM Plex Mono.
- All translations are inlined as per-locale maps keyed by item ID, for example `I18N_ID.name.eiffel`.

## Tech (inferred from the shipped code)
- **Plain three.js r128** loaded as a global script (`/lib/three.min.js`), plus `OrbitControls`, `LineSegments2`/`LineMaterial`/`LineSegmentsGeometry` and `topojson-client`.
- There is **no bundler framework**: two hand-built, content-hashed stages. Stage 2 is fetched and run in chunks that yield to the main thread, which is why headless browser automation times out while it boots.
- **No .glb/.gltf at all.** Every landmark, animal and vehicle is a `BUILD[key](group)` function that composes `Box`, `Cylinder`, `Cone`, `Sphere`, `Torus`, `Lathe`, `Extrude` and `Tube` geometries. In the bundles there are about 1,275 geometry constructors in s1 and 62 `CatmullRomCurve3` uses.
- Built models are **baked**: colours move into vertex colours (470 `vertexColors` uses), and meshes are merged per "look" (roughness, metalness, glow, transparency, water) into very few draw calls. The bundle carries model footprint/height metadata (`data/lm_meta.json`, hashed by `MODEL_SRC`).
- Performance techniques:
  - `InstancedMesh` for repeated things such as trees.
  - **Snapshot LOD**: below 18 px on screen, a model is replaced by a merged static snapshot and stops animating; above 24 px the live model comes back.
  - Pixel ratio capped at 2.
  - 2K textures on small devices.
  - A "layout DB" (`data/layout_db.json`) stores hand-tuned marker positions.
- Requires JavaScript and WebGL. Backend is Supabase (auth plus a progress table). No third-party analytics scripts were found.

## Feature-history highlights from /updates (Oct–Nov 2026)
A Moon you can visit, real day/night, clouds you can fly through, a daily landmark puzzle with stamps and streaks, Halloween and Christmas events, a 1–4 player quiz, school mode, and Bahasa Indonesia (making five content languages, not the four in the marketing copy).

## What we deliberately do NOT copy
- No code, text, translations, fact wording, landmark/animal/route selection lists, or assets of any kind from myearthtoy.com.
- Our models are original code-built primitives (see `PLAN.md` §5.1 "models as code"), our content facts are written in our own words and checked against independent primary sources (Wikipedia, IUCN, NOAA, official sites), and our photos (if any) come from Wikimedia Commons with their own licence/attribution — never scraped from the reference site.
