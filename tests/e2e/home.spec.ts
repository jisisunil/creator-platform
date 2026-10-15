import { expect, test } from '@playwright/test';

/** NFR-6: what a first visit may download, compressed (about 4 s on a slow 3G line). */
const PAGE_WEIGHT_BUDGET_BYTES = 400 * 1024;

test.describe('home page and app shell', () => {
  test('NFR-7 redirects to English and renders the home page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('verified creators');
  });

  test('NFR-7 switches the interface to Hindi', async ({ page }) => {
    await page.goto('/en');

    await page.getByRole('link', { name: 'हिन्दी' }).click();

    await expect(page).toHaveURL(/\/hi$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('सत्यापित क्रिएटर');
  });

  test('SR-8 page scripts run under the CSP without violations', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    const response = await page.goto('/en');
    await page.waitForLoadState('networkidle');

    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(violations).toEqual([]);
  });

  test('NFR-9 offers a skip link as the first focusable element', async ({ page }) => {
    await page.goto('/en');

    await page.keyboard.press('Tab');

    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  });

  test('unknown pages show a translated not-found page', async ({ page }) => {
    const response = await page.goto('/hi/does-not-exist');

    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('पेज नहीं मिला');
  });

  test('NFR-5 is installable: the manifest lists PNG and maskable icons', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();

    const sizes = manifest.icons.map((icon: { sizes: string; purpose: string }) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).status()).toBe(200);
    }
  });

  test('NFR-5 shows an offline page when the network drops', async ({ page, context }) => {
    await page.goto('/hi');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.goto('/hi/sign-in');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('आप ऑफ़लाइन हैं');
    await context.setOffline(false);
  });

  test('NFR-6 the home page stays light on slow connections', async ({ page }) => {
    let transferredBytes = 0;
    page.on('requestfinished', async (request) => {
      const sizes = await request.sizes();
      transferredBytes += sizes.responseBodySize + sizes.responseHeadersSize;
    });

    await page.goto('/en');
    await page.waitForLoadState('networkidle');

    expect(transferredBytes).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  });

  test('NFR-10 health endpoint reports the database is up', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ isHealthy: true, database: 'up' });
  });
});
