import type { Browser, Page } from '@playwright/test';
import { DEMO_PASSWORD, signedInNewBrand, signIn } from './support/accounts';
import { expect, test, uniqueEmail } from './support/fixtures';

/** Demo creators open to collaborations, one per screen size (per-account sign-in limit). */
const DEMO_CREATOR = { desktop: '48', 'mobile-360': '51' } as const;

function demoCreator() {
  const index = DEMO_CREATOR[test.info().project.name as keyof typeof DEMO_CREATOR];
  return { slug: `demo-creator-${index}`, email: `demo-creator-${index}@example.test` };
}

async function signedInCreator(browser: Browser, email: string): Promise<Page> {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` },
  });
  const page = await context.newPage();
  await signIn(page, email, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  return page;
}

test.describe('plans and notifications', () => {
  test('FR-11.1 FR-11.2 a brand sees its plan, usage and upgrade options', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('plan'));

    await page.goto('/en/brand/plan');

    await expect(page.getByRole('heading', { name: 'Your plan: Free beta' })).toBeVisible();
    await expect(page.getByText(/contact requests left/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upgrade options' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  });

  test('FR-12.1 FR-12.2 a creator is notified of a request and can turn emails off', async ({
    page,
    browser,
  }) => {
    const demo = demoCreator();
    await signedInNewBrand(page, uniqueEmail('notify'));
    await page.goto(`/en/brand/requests/new?creator=${demo.slug}`);
    await page.getByLabel('Campaign name').fill('E2E notification campaign');
    await page
      .getByLabel('Brief', { exact: true })
      .fill('One reel about our festive sweets box, warm family tone.');
    await page.getByLabel('Reel', { exact: true }).fill('1');
    await page
      .getByLabel('Content deadline')
      .fill(new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page).toHaveURL(/\/en\/brand\/requests\/\w+$/);

    const creator = await signedInCreator(browser, demo.email);
    await creator.goto('/en/notifications');
    await expect(
      creator.getByRole('link', {
        name: /sent you a collaboration request for "E2E notification campaign"/,
      }),
    ).toBeVisible();

    await creator.goto('/en/settings');
    await creator.getByLabel('Collaboration requests: Email').uncheck();
    await creator.getByRole('button', { name: 'Save notification settings' }).click();
    await expect(creator.getByText('Notification settings saved.')).toBeVisible();
    await creator.reload();
    await expect(creator.getByLabel('Collaboration requests: Email')).not.toBeChecked();
    // Leave the shared demo account as it was for other runs.
    await creator.getByLabel('Collaboration requests: Email').check();
    await creator.getByRole('button', { name: 'Save notification settings' }).click();
    await expect(creator.getByText('Notification settings saved.')).toBeVisible();
    await creator.context().close();
  });
});
