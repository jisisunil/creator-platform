import { DEMO_PASSWORD, signedInNewCreator, signIn } from './support/accounts';
import { expect, test, uniqueEmail } from './support/fixtures';

test.describe('creators', () => {
  test('UC-C1 FR-3 a new creator completes their profile and connects YouTube', async ({
    page,
  }) => {
    await signedInNewCreator(page, uniqueEmail('profile'));
    await expect(page.getByText('Profile 11% complete')).toBeVisible();

    await page.goto('/en/creator/profile');
    await page.getByLabel('Display name').fill('E2E Kitchen');
    await page.getByLabel('Bio').fill('Home-style recipes from Chennai, cooked in a tiny kitchen.');
    await page.getByLabel('State or union territory').selectOption({ label: 'Tamil Nadu' });
    await page.getByLabel('City').fill('Chennai');
    await page.getByLabel('தமிழ்').check();
    await page.getByLabel('Food', { exact: true }).check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.').first()).toBeVisible();

    await page.goto('/en/creator/accounts');
    await page.getByRole('button', { name: 'Connect YouTube (sign in with Google)' }).click();
    await expect(page).toHaveURL(/\/en\/creator\/accounts\?result=connected$/);
    await expect(page.getByText('Account connected.')).toBeVisible();
    await expect(page.getByText('(Verified)')).toBeVisible();
  });

  test('UC-C1 a bio with a phone number is refused', async ({ page }) => {
    await signedInNewCreator(page, uniqueEmail('bio'));
    await page.goto('/en/creator/profile');
    await page.getByLabel('Bio').fill('Call me on 9876543210 for collabs');
    await page.getByLabel('State or union territory').selectOption({ label: 'Kerala' });
    await page.getByLabel('City').fill('Kochi');
    await page.getByLabel('English').check();
    await page.getByLabel('Travel').check();

    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Remove phone numbers, emails and links.')).toBeVisible();
  });

  test('UC-C5 disconnecting an account removes it', async ({ page }) => {
    await signedInNewCreator(page, uniqueEmail('disconnect'));
    await page.goto('/en/creator/accounts');
    await page.getByRole('button', { name: 'Connect Instagram' }).click();
    await expect(page.getByText('Account connected.')).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Disconnect' }).click();

    await expect(page.getByText('No accounts connected yet.')).toBeVisible();
  });

  test('UC-C7 a demo creator sees growth charts and the score breakdown', async ({ page }) => {
    await signIn(page, 'demo-creator-05@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.goto('/en/creator/analytics');

    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await expect(page.getByText('Engagement', { exact: true })).toBeVisible();
    await expect(page.getByText('Scoring rules v1')).toBeVisible();
  });

  test('SR-5 brands cannot open creator pages', async ({ page }) => {
    await signIn(page, 'brand-owner@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.goto('/en/creator/profile');

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});

test.describe('public profiles', () => {
  test('FR-2.4 SR-12 shows score, accounts and audience, never contact details', async ({
    page,
  }) => {
    const response = await page.goto('/en/c/demo-creator-03');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('(demo)');
    await expect(page.getByText('Authenticity', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audience' })).toBeVisible();
    const html = (await response?.text()) ?? '';
    expect(html).not.toContain('demo-creator-03@example.test');
  });

  test('UC-D2 an unknown profile says it is unavailable', async ({ page }) => {
    await page.goto('/en/c/no-such-creator');

    await expect(page.getByRole('heading', { name: 'Profile unavailable' })).toBeVisible();
  });
});
