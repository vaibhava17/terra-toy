# Content

This directory is the **source of truth** for everything that appears on the globe: landmarks, animals, vehicles, routes and hidden discoveries. Each item lives in its own JSON file (for example `landmarks/eiffel-tower.json`), which keeps PRs small and merge-friendly. Every fact needs a source URL, and all names and blurbs are written in our own words (see `docs/PLAN.md` §3.2 and §5). The Zod schemas, `scripts/validate-content.ts` and `scripts/build-content.ts` land in Phase 1. The build step will compile this folder into `src/generated/`, which is gitignored.
