# Terra Toy

An original, free, ad-free, browser-based interactive 3D globe for kids (~6–12). Spin and zoom a stylised Earth, discover low-poly landmarks and animals in their real habitats, ride vehicles along real-world routes, and play geography games (pin-drop, globe quiz, flag quiz, daily puzzle).

The concept is inspired by [myearthtoy.com](https://myearthtoy.com) (see [`docs/ANALYSIS.md`](docs/ANALYSIS.md) for the full feature analysis of that site), but **nothing is copied**: no code, no models, no text, no translations, no content lists. Every asset here is built from scratch — models as procedural three.js code, facts written and sourced independently, photos (if used) pulled fresh from Wikimedia Commons with their own licence.

## Status

🏗️ **Phase 1: MVP globe (in progress).** Phase 0 (tooling, CI, geo math, WebGL check with a friendly fallback, loading screen) is done. Phase 1 so far adds the real interactive globe:

- `Engine` (renderer, frame loop, resize, pixel-ratio policy, pause when hidden) loaded lazily so three.js is its own chunk.
- `GlobeRig`: orbit with inertia, altitude-scaled rotate speed, zoom-dependent tilt toward the horizon, eased great-circle `flyTo`, zoom steps, reset view, and a gentle idle auto-rotate (off with `prefers-reduced-motion`).
- A stylised toy Earth painted at runtime from Natural Earth land (`world-atlas`): shallow-water halo, soft ice caps, sea gloss, and a Fresnel atmosphere.
- Country borders as pixel-width fat lines in one neutral colour (no political colouring of disputed areas). They follow the curve of the globe and switch from Natural Earth 1:110m to 1:50m detail as you zoom in. The 50m data loads only when it is first needed.
- Tapping or hovering a disputed area (currently the Kashmir region, including Siachen) shows a neutral "Disputed area" label instead of a claimant country's name, from a small Natural Earth disputed-areas overlay (`src/engine/globe/disputed.ts`).
- Country hover and tap: hovering with a mouse or pen outlines the country under the cursor. Tapping a country selects it, and its name shows in a chip at the bottom of the screen; tapping the sea or the chip's × clears it. Dragging to spin the globe never selects anything.
- HUD: zoom in/out, reset view, full screen. Add `?debug=1` for an fps / draw-call overlay.

The content pipeline, landmarks and info cards come in the next Phase 1 PRs. See [`docs/PLAN.md`](docs/PLAN.md) for the full build plan: tech stack, architecture, data model, phased milestones, asset strategy, starter content lists (20 landmarks, 20 animals, 15 routes), and open risks.

## Develop

Requires **Node 22** (see `.nvmrc`; Node ≥ 20 works). We use **npm**.

```sh
nvm use               # optional, picks Node 22 from .nvmrc
npm ci                # install exact locked dependencies
npm run dev           # Vite dev server at http://localhost:5173
npm test              # Vitest unit tests (tests/unit)
npm run test:e2e      # Playwright smoke tests (builds + previews on :4173; needs Chromium installed)
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier (format:check runs in CI)
npm run build         # typecheck + production build into dist/
```

Before opening a PR, run `typecheck`, `lint`, `format:check`, `test` and `build`. CI runs the same checks.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — the build plan (read this first).
- [`docs/ANALYSIS.md`](docs/ANALYSIS.md) — reference-site feature analysis (research only, not reused content).
- [`.claude/skills/3d-globe-webapp/SKILL.md`](.claude/skills/3d-globe-webapp/SKILL.md) — the skill coding agents should load before touching this repo.

## Tech

Vite 6 + TypeScript (strict) + three.js (imperative) + Preact (UI overlay) + Zustand (state) + Vitest/Playwright (tests). Zod content validation arrives in Phase 1. Deployed to Cloudflare Pages at https://terra-toy.heyvaibhav.dev on every push to `main`; see [DEPLOY.md](DEPLOY.md).

## License

TBD.
