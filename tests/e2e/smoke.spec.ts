import { expect, test } from '@playwright/test';

const FALLBACK_TEXT = "Your browser can't show the 3D globe";

async function bootPhase(page: import('@playwright/test').Page): Promise<string> {
  await page.waitForFunction(() => window.__toyReady !== undefined);
  return page.evaluate(async () => {
    await window.__toyReady;
    return window.__toy!.store.getState().boot;
  });
}

test('boots to the app shell (or the fallback, consistently with the DOM)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Terra Toy');
  const boot = await bootPhase(page);
  expect(['ready', 'no-webgl']).toContain(boot);
  if (boot === 'ready') {
    await expect(page.getByText('Globe coming soon!')).toBeVisible();
    await expect(page.getByText(FALLBACK_TEXT)).toHaveCount(0);
  } else {
    await expect(page.getByText(FALLBACK_TEXT)).toBeVisible();
  }
  await expect(page.getByRole('status')).toHaveCount(0); // loader hidden
});

test('shows the friendly fallback when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = function () {
      return null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');
  expect(await bootPhase(page)).toBe('no-webgl');
  await expect(page.getByRole('heading', { name: FALLBACK_TEXT })).toBeVisible();
  await expect(page.getByText('Update your web browser')).toBeVisible();
  const webgl = await page.evaluate(() => window.__toy!.store.getState().webgl);
  expect(webgl.version).toBe(0);
});
