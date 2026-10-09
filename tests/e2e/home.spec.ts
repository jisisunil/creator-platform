import { expect, test } from '@playwright/test';

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

  test('NFR-10 health endpoint reports the database is up', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ isHealthy: true, database: 'up' });
  });
});
