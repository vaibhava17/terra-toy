# Content

This directory is the **source of truth** for everything that appears on the globe: landmarks, animals, vehicles, routes and hidden discoveries. Each item lives in its own JSON file (for example `landmarks/eiffel-tower.json`), which keeps PRs small and merge-friendly. Every fact needs a source URL, and all names and blurbs are written in our own words (see `docs/PLAN.md` §3.2 and §5).

## Landmarks

`landmarks/<id>.json`, one file per landmark, checked against the Zod schema in `src/content/schema.ts`:

- `id` is kebab-case and must equal the file name; ids are unique.
- `pos.lat` / `pos.lng` are in range; `country` is an ISO 3166-1 alpha-2 code; `continent` is one of `africa`, `asia`, `europe`, `north-america`, `south-america`, `oceania`, `antarctica`.
- `name.en` and `blurb.en` are required (other locales are optional). Keep blurbs to one or two short sentences for ages 6–12.
- Every fact has a snake_case `key` (a `_m` / `_km` suffix is the unit), a `value` and an http(s) `source`. The card's labels for keys live in `src/content/facts.ts`.
- `model`, `scale`, `photo` and `minZoom` are optional. Until the procedural models land, landmarks show as pins. `minZoom` uses the zoom scale in `src/engine/entities/landmarkMath.ts` (0 = fully zoomed out, +1 each time the camera height halves); leave it out to show a landmark at every zoom.

Run `npm run content:validate` after editing. It is part of `npm test` as well, and the app validates the same files when it loads them (Vite inlines them at build time).

The other folders are still empty. `scripts/build-content.ts` (planned) will later compile this folder into `src/generated/`, which is gitignored.
