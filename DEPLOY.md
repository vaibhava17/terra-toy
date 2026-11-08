# Deploy

## Host

- Cloudflare Pages, project `terra-toy`, on the heyvaibhav.dev Cloudflare account.
- Direct Upload project (no Cloudflare Git integration); CI uploads the build.
- Default URL: https://terra-toy.pages.dev
- Live URL: https://terra-toy.heyvaibhav.dev — custom domain on the Pages project. DNS is a proxied CNAME `terra-toy` -> `terra-toy.pages.dev` in the heyvaibhav.dev zone.

## Build

- `npm run build` (`tsc --noEmit && vite build`), output in `dist/`.
- Node version from `.nvmrc` (22).

## How deploys trigger

Every push to `main` (i.e. merging a PR) runs CI (`.github/workflows/ci.yml`). When the `check` job passes, it uploads `dist/` as an artifact and the `deploy-production` job deploys it with `wrangler pages deploy`. The deploy job never runs `npm ci`, so the Cloudflare token is not exposed to dependency install scripts.

PRs do not deploy: the `deploy-preview` job is disabled to save Actions minutes.

## Required repo secrets

- `CLOUDFLARE_API_TOKEN` — should be a scoped token with only Account > Cloudflare Pages > Edit. If a broader token is set, replace it with a scoped one (`gh secret set CLOUDFLARE_API_TOKEN`).
- `CLOUDFLARE_ACCOUNT_ID`

If the token is missing, the job logs a notice and skips the deploy.

## Manual deploy (fallback)

Use this when Actions is unavailable (e.g. the Actions budget is exhausted). From a clean checkout of `main`:

```sh
npm ci && npm run build && \
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  npx wrangler@3 pages deploy dist --project-name=terra-toy --branch=main --commit-hash=$(git rev-parse HEAD)
```

Never commit the token.

## Rollback

- Dashboard (instant, no rebuild): Workers & Pages > terra-toy > Deployments > pick the last good production deployment > "Rollback to this deployment".
- API: `POST /accounts/{account_id}/pages/projects/terra-toy/deployments/{deployment_id}/rollback`. List deployments with `npx wrangler pages deployment list --project-name=terra-toy`.
- Or revert the bad commit on `main` via a PR, which redeploys.

After a dashboard/API rollback, follow up with a revert PR so `main` matches what is live.

## Verify

```sh
curl -I https://terra-toy.heyvaibhav.dev                      # expect HTTP 200
curl -s https://terra-toy.heyvaibhav.dev | grep -o '<title>.*</title>'  # expect <title>Terra Toy</title>
```
