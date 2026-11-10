import { expect, test, type Page } from '@playwright/test';

/** Waits for boot (and the globe, if WebGL is available) to finish; returns the boot phase. */
async function bootPhase(page: Page): Promise<string> {
  await page.waitForFunction(() => window.__toyReady !== undefined);
  return page.evaluate(async () => {
    await window.__toyReady;
    return window.__toy!.store.getState().boot;
  });
}

const globeState = (page: Page) => page.evaluate(() => window.__toy!.store.getState().globe);

/**
 * Close enough to fill the view with France, and no closer: from 2.4 inward the rig
 * tilts (orbiting around the centre point), which changes what lies off-centre.
 */
const FRANCE = { lat: 46.6, lng: 2.4, distance: 2.4 };
/** A short flight: SwiftShader renders only a few frames a second. */
const FLIGHT_MS = 600;

test('tap selects the country under the pointer; drags do not; × clears it', async ({ page }) => {
  test.setTimeout(120_000); // software GL: the flight, click, drag and inertia all take a while
  await page.goto('/');
  test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');

  await page.evaluate(
    ({ lat, lng, distance, ms }) => window.__toy!.engine!.flyTo(lat, lng, distance, ms),
    { ...FRANCE, ms: FLIGHT_MS },
  );
  // Poll store state (never pixels) until the flight has settled over France.
  await expect
    .poll(
      async () => {
        const { view } = await globeState(page);
        return (
          Math.abs(view.lat - FRANCE.lat) < 0.05 &&
          Math.abs(view.lng - FRANCE.lng) < 0.05 &&
          Math.abs(view.distance - FRANCE.distance) < 0.01
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A click is the real path: pointer events → ray → lat/lng → country → store.
  await page.mouse.click(cx, cy);
  await expect
    .poll(async () => (await globeState(page)).selectedCountry?.name ?? null)
    .toBe('France');
  const chip = page.getByTestId('country-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('France');

  // Dragging spins the globe and must not change the selection.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy, { steps: 5 });
  await page.mouse.move(cx + 100, cy, { steps: 5 });
  await page.mouse.up();
  // Let the spin's inertia settle, then check nothing was (re)selected.
  await expect
    .poll(async () => Math.abs((await globeState(page)).view.lng - FRANCE.lng), {
      timeout: 10_000,
    })
    .toBeGreaterThan(1);
  expect((await globeState(page)).selectedCountry).toEqual({ id: '250', name: 'France' });

  await page.getByRole('button', { name: 'Close France' }).click();
  await expect.poll(async () => (await globeState(page)).selectedCountry).toBeNull();
  await expect(chip).toHaveCount(0);
});
