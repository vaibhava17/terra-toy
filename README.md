# Terra Toy

An original, free, ad-free, browser-based interactive 3D globe for kids (~6–12). Spin and zoom a stylised Earth, discover low-poly landmarks and animals in their real habitats, ride vehicles along real-world routes, and play geography games (pin-drop, globe quiz, flag quiz, daily puzzle).

The concept is inspired by [myearthtoy.com](https://myearthtoy.com) (see [`docs/ANALYSIS.md`](docs/ANALYSIS.md) for the full feature analysis of that site), but **nothing is copied**: no code, no models, no text, no translations, no content lists. Every asset here is built from scratch — models as procedural three.js code, facts written and sourced independently, photos (if used) pulled fresh from Wikimedia Commons with their own licence.

## Status

🏗️ **Phase 0: scaffold.** Tooling, CI, geo math (`src/engine/geo.ts`), a WebGL capability check with a friendly fallback screen, and a loading screen are in place. The globe itself arrives in Phase 1. See [`docs/PLAN.md`](docs/PLAN.md) for the full build plan: tech stack, architecture, data model, phased milestones, asset strategy, starter content lists (20 landmarks, 20 animals, 15 routes), and open risks.

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

Vite 6 + TypeScript (strict) + three.js (imperative) + Preact (UI overlay) + Zustand (state) + Vitest/Playwright (tests). Zod content validation arrives in Phase 1. Deploy target: Cloudflare Pages or GitHub Pages (static site, no required backend).

## License

TBD.
