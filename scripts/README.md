# Scripts

Build-time Node scripts, planned in `docs/PLAN.md` §3.1. **None are implemented yet.**

| Script                | Phase | Purpose                                                                                  |
| --------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `validate-content.ts` | 1     | Zod validation of `content/**`, cross-references, i18n completeness report (runs in CI). |
| `build-content.ts`    | 1     | `content/**` → `src/generated/content.<locale>.json` plus a spatial index.               |
| `bake-models.ts`      | 1+    | Runs model builders headless → footprint/height metadata, optional `.glb` export.        |
| `fetch-photo.ts`      | 1     | Wikimedia Commons API → optimised `.webp` plus a licence/author record.                  |
| `textures.ts`         | 1     | Resizes and converts NASA/Natural Earth sources into the stylised textures with `sharp`. |
