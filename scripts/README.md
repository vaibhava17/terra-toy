# Scripts

Build-time Node scripts, planned in `docs/PLAN.md` §3.1. **None are implemented yet.**

Content validation does not need a script of its own: `npm run content:validate` runs the Vitest suite `tests/unit/content.test.ts` against the Zod schemas in `src/content/schema.ts` (and CI runs it). A standalone `validate-content.ts` can come back once there are cross-references and an i18n completeness report to check.

| Script                | Phase | Purpose                                                                                  |
| --------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `validate-content.ts` | 1+    | Cross-references and an i18n completeness report (schema checks: `content:validate`).    |
| `build-content.ts`    | 1     | `content/**` → `src/generated/content.<locale>.json` plus a spatial index.               |
| `bake-models.ts`      | 1+    | Runs model builders headless → footprint/height metadata, optional `.glb` export.        |
| `fetch-photo.ts`      | 1     | Wikimedia Commons API → optimised `.webp` plus a licence/author record.                  |
| `textures.ts`         | 1     | Resizes and converts NASA/Natural Earth sources into the stylised textures with `sharp`. |
