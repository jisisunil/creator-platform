import { TOTP } from 'otpauth';
import { DEMO_PASSWORD, signedInNewCreator, signIn } from './support/accounts';
import { expect, PASSWORD, test, uniqueEmail } from './support/fixtures';

/** Matches prisma/seed/demo-accounts.ts (development and tests only). */
const OPS_ADMIN = 'ops-admin@example.test';
const OPS_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

test.describe('admin console', () => {
  test('FR-13 an admin passes two-factor, sees metrics, finds a user, and the visit is audited', async ({
    page,
  }) => {
    await signIn(page, OPS_ADMIN, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/two-factor$/);
    await page
      .getByLabel('6-digit code')
      .fill(new TOTP({ secret: OPS_ADMIN_TOTP_SECRET }).generate());
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.goto('/en/admin');
    await expect(page.getByRole('heading', { name: 'Last 30 days' })).toBeVisible();

    await page.goto('/en/admin/users?q=brand-owner');
    await page.getByRole('link', { name: 'Demo Brand Owner' }).click();
    await expect(page.getByText('brand-owner@example.test')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change plan' })).toBeVisible();

    await page.goto('/en/admin/audit?action=user.viewed');
    await expect(page.getByRole('cell', { name: 'user.viewed' }).first()).toBeVisible();
  });

  test('SR-5 brands and creators cannot open the admin console', async ({ page }) => {
    await signedInNewCreator(page, uniqueEmail('not-admin'));

    await page.goto('/en/admin');

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});

test.describe('privacy rights', () => {
  test('PRV-2 PRV-4 a user downloads their data, then deletes their account', async ({ page }) => {
    const email = uniqueEmail('leaving');
    await signedInNewCreator(page, email);
    await page.goto('/en/settings');

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download my data (JSON)' }).click();
    expect((await download).suggestedFilename()).toMatch(/^my-data-\d{4}-\d{2}-\d{2}\.json$/);

    await page.getByLabel('Type your email address to confirm').fill(email);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page).toHaveURL(/\/en\/sign-in\?deleted=1$/);
    await expect(page.getByText('Your account is closed')).toBeVisible();

    await signIn(page, email, PASSWORD);
    await expect(page.getByText(/email and password don.t match/)).toBeVisible();
  });
});
