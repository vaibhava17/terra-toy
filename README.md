# Terra Toy

An original, free, ad-free, browser-based interactive 3D globe for kids (~6–12). Spin and zoom a stylised Earth, discover low-poly landmarks and animals in their real habitats, ride vehicles along real-world routes, and play geography games (pin-drop, globe quiz, flag quiz, daily puzzle).

The concept is inspired by [myearthtoy.com](https://myearthtoy.com) (see [`docs/ANALYSIS.md`](docs/ANALYSIS.md) for the full feature analysis of that site), but **nothing is copied**: no code, no models, no text, no translations, no content lists. Every asset here is built from scratch — models as procedural three.js code, facts written and sourced independently, photos (if used) pulled fresh from Wikimedia Commons with their own licence.

## Status

📋 Planning. See [`docs/PLAN.md`](docs/PLAN.md) for the full build plan: tech stack, architecture, data model, phased milestones, asset strategy, starter content lists (20 landmarks, 20 animals, 15 routes), and open risks.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md) — the build plan (read this first).
- [`docs/ANALYSIS.md`](docs/ANALYSIS.md) — reference-site feature analysis (research only, not reused content).
- [`.claude/skills/3d-globe-webapp/SKILL.md`](.claude/skills/3d-globe-webapp/SKILL.md) — the skill coding agents should load before touching this repo.

## Tech (planned)

Vite + TypeScript + three.js (imperative) + Preact (UI overlay) + Zustand (state) + Zod (content validation) + Vitest/Playwright (tests). Deploy target: Cloudflare Pages or GitHub Pages (static site, no required backend).

## License

TBD.
