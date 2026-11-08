import { expect, test, type Page } from '@playwright/test';

const FALLBACK_TEXT = "Your browser can't show the 3D globe";

/** Waits for boot (and the globe, if WebGL is available) to finish; returns the boot phase. */
async function bootPhase(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__toyReady !== undefined);
  return page.evaluate(async () => {
    await window.__toyReady;
    return window.__toy!.store.getState().boot;
  });
}

const globeState = (page: Page) => page.evaluate(() => window.__toy!.store.getState().globe);

test('boots to the globe (or the fallback, consistently with the DOM)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Terra Toy');
  const boot = await bootPhase(page);
  expect(['ready', 'no-webgl']).toContain(boot);
  if (boot === 'ready') {
    const globe = await globeState(page);
    expect(globe.status).toBe('ready');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText(FALLBACK_TEXT)).toHaveCount(0);
    for (const name of ['Zoom in', 'Zoom out', 'Reset view']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    expect(await page.evaluate(() => typeof window.__toy!.engine?.flyTo)).toBe('function');
  } else {
    await expect(page.getByText(FALLBACK_TEXT)).toBeVisible();
  }
  await expect(page.getByRole('status')).toHaveCount(0); // loader hidden
});

test('zoom in and reset view change the settled camera distance', async ({ page }) => {
  await page.goto('/');
  test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');
  const start = (await globeState(page)).view.distance;

  await page.getByRole('button', { name: 'Zoom in' }).click();
  // Poll store state (never pixels) until the zoom animation has settled.
  await expect
    .poll(async () => (await globeState(page)).view.distance, { timeout: 10_000 })
    .toBeLessThan(start - 0.1);
  const zoomed = (await globeState(page)).view.distance;
  expect(zoomed).toBeCloseTo(start * 0.7, 1);

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect
    .poll(async () => (await globeState(page)).view.distance, { timeout: 10_000 })
    .toBeCloseTo(start, 2);
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
