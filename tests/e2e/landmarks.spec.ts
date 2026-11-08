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

/** Polls store state (never pixels) until the settled view is over (lat, lng) at `distance`. */
async function expectViewNear(
  page: Page,
  { lat, lng, distance }: { lat: number; lng: number; distance: number },
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { view } = await globeState(page);
        return (
          Math.abs(view.lat - lat) < 0.05 &&
          Math.abs(view.lng - lng) < 0.05 &&
          Math.abs(view.distance - distance) < 0.01
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

const EIFFEL = { lat: 48.8584, lng: 2.2945 };
/** Far from every other landmark, so its pin is the only one around. */
const SYDNEY = { id: 'sydney-opera-house', lat: -33.8568, lng: 151.2153 };
/** No zoom tilt from 2.4 outward, so the landmark sits mid-screen (see borders.spec.ts). */
const NO_TILT_DISTANCE = 2.4;
/** Where the engine flies for a landmark from the start view (LANDMARK_VIEW_DISTANCE). */
const LANDMARK_VIEW_DISTANCE = 2;

test('?focus=<id> opens the landmark card and flies there; × closes it', async ({ page }) => {
  test.setTimeout(120_000); // software GL: the flight takes a while
  await page.goto('/?focus=eiffel-tower');
  test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');

  expect((await globeState(page)).selectedLandmark).toBe('eiffel-tower');
  const card = page.getByTestId('info-card');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Eiffel Tower' })).toBeVisible();
  await expect(card).toContainText('France');
  await expect(card.getByRole('link').first()).toHaveAttribute('rel', 'noopener noreferrer');

  await expectViewNear(page, { ...EIFFEL, distance: LANDMARK_VIEW_DISTANCE });

  await card.getByRole('button', { name: 'Close Eiffel Tower' }).click();
  await expect.poll(async () => (await globeState(page)).selectedLandmark).toBeNull();
  await expect(card).toHaveCount(0);
});

test('an unknown ?focus id is ignored', async ({ page }) => {
  await page.goto('/?focus=atlantis');
  test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');
  expect((await globeState(page)).selectedLandmark).toBeNull();
  await expect(page.getByTestId('info-card')).toHaveCount(0);
});

test('tapping a pin selects its landmark (not the country under it)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');

  await page.evaluate(
    ({ lat, lng, distance }) => window.__toy!.engine!.flyTo(lat, lng, distance, 600),
    { ...SYDNEY, distance: NO_TILT_DISTANCE },
  );
  await expectViewNear(page, { ...SYDNEY, distance: NO_TILT_DISTANCE });
  // A country is selected first, so the tap has something to clear.
  await page.evaluate(() =>
    window.__toy!.store.getState().setSelectedCountry({ id: '036', name: 'Australia' }),
  );

  const at = await page.evaluate((id) => window.__toy!.engine!.landmarkScreenPos(id), SYDNEY.id);
  expect(at).not.toBeNull();
  // A click is the real path: pointer events → ray → proxy spheres → store.
  await page.mouse.click(at!.x, at!.y);

  await expect.poll(async () => (await globeState(page)).selectedLandmark).toBe(SYDNEY.id);
  expect((await globeState(page)).selectedCountry).toBeNull();
  await expect(page.getByTestId('info-card')).toContainText('Sydney Opera House');
  // The tap also flies in to the landmark.
  await expectViewNear(page, { ...SYDNEY, distance: LANDMARK_VIEW_DISTANCE });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 640, height: 400 },
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test(`phone ${viewport.width}x${viewport.height}: the open card leaves the HUD usable`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.goto('/?focus=eiffel-tower');
    test.skip((await bootPhase(page)) !== 'ready', 'WebGL is not available in this browser');
    await expect(page.getByTestId('info-card')).toBeVisible();

    // Every HUD button is the topmost element at its own centre (nothing covers it).
    const hud = page.getByRole('navigation', { name: 'Globe controls' });
    const expectHudUncovered = async () => {
      for (const button of await hud.getByRole('button').all()) {
        const covered = await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !(top && el.contains(top));
        });
        expect(covered, (await button.getAttribute('aria-label')) ?? 'HUD button').toBe(false);
      }
    };
    await expectHudUncovered();

    // The open menu leaves the HUD usable too, so a second tap on Landmarks closes it.
    const landmarksButton = hud.getByRole('button', { name: 'Landmarks' });
    await landmarksButton.click();
    await expect(page.locator('#landmark-list')).toBeVisible();
    await expectHudUncovered();
    await landmarksButton.click();
    await expect(page.locator('#landmark-list')).toBeHidden();

    await expectViewNear(page, { ...EIFFEL, distance: LANDMARK_VIEW_DISTANCE });
    await hud.getByRole('button', { name: 'Zoom in' }).click();
    await expect
      .poll(async () => (await globeState(page)).view.distance)
      .toBeLessThan(LANDMARK_VIEW_DISTANCE - 0.01);

    // The menu opens over the card and picking another landmark swaps the card.
    await landmarksButton.click();
    await page.getByRole('button', { name: /Sydney Opera House/ }).click();
    await expect.poll(async () => (await globeState(page)).selectedLandmark).toBe(SYDNEY.id);
    await expect(page.getByTestId('info-card')).toContainText('Sydney Opera House');
  });
}
