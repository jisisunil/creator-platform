import { TOTP } from 'otpauth';
import { signIn, signUpCreator, verifyFromEmail } from './support/accounts';
import { expect, PASSWORD, test, uniqueEmail } from './support/fixtures';
import { linkFromEmail } from './support/mailpit';

test.describe('accounts', () => {
  test('UC-A1 FR-1.1 a creator signs up, verifies their email and signs in', async ({ page }) => {
    const email = uniqueEmail('creator');

    await signUpCreator(page, email);
    await verifyFromEmail(page, email);
    await signIn(page, email);

    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Welcome, E2E Creator' })).toBeVisible();
  });

  test('UC-A1 under-18 visitors are stopped before anything is sent', async ({ page }) => {
    await page.goto('/en/sign-up');
    await page.getByLabel('Your name').fill('Too Young');
    await page.getByLabel('Email').fill(uniqueEmail('young'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel(/I have read and agree to the/).check();

    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('You must be 18 or older')).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-up/);
  });

  test('UC-A2 unverified accounts cannot sign in yet', async ({ page }) => {
    const email = uniqueEmail('unverified');
    await signUpCreator(page, email);

    await signIn(page, email);

    await expect(page.getByText('Please verify your email first')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send the verification link again' }),
    ).toBeVisible();
  });

  test('UC-A3 a forgotten password is reset from the emailed link', async ({ page }) => {
    const email = uniqueEmail('forgetful');
    await signUpCreator(page, email);
    await verifyFromEmail(page, email);

    await page.goto('/en/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('a reset link is on its way')).toBeVisible();
    const link = await linkFromEmail(email, /Reset your password/, '/reset-password');
    await page.goto(link);
    await page.getByLabel('New password').fill('e2e-a-new-passphrase');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText('Your password has been changed')).toBeVisible();

    await signIn(page, email, 'e2e-a-new-passphrase');
    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });

  test('SR-2 signing out ends access to account pages', async ({ page }) => {
    const email = uniqueEmail('signout');
    await signUpCreator(page, email);
    await verifyFromEmail(page, email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.goto('/en/settings');

    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });

  test('PRV-5 marketing consent is turned on and off from settings', async ({ page }) => {
    const email = uniqueEmail('marketing');
    await signUpCreator(page, email);
    await verifyFromEmail(page, email);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await page.goto('/en/settings');

    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByText("You're receiving product news.")).toBeVisible();
    await page.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByText("You're not receiving product news.")).toBeVisible();
  });
});

test.describe('access control', () => {
  for (const path of ['/en/dashboard', '/en/settings', '/en/brand/team']) {
    test(`SR-5 ${path} sends visitors to sign in`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/en\/sign-in$/);
    });
  }
});

test.describe('admin two-factor', () => {
  test('SR-4 the demo admin must pass a TOTP check before reaching the dashboard', async ({
    page,
  }) => {
    await signIn(page, 'admin@example.test', 'Demo-Password-2026');
    await expect(page).toHaveURL(/\/en\/two-factor$/);

    // Fresh database: set up the authenticator. Otherwise this admin already has one, and
    // the test can only check that the dashboard stays locked.
    const secretBox = page.getByTestId('totp-secret');
    if (await secretBox.isVisible()) {
      const secret = (await secretBox.textContent())?.trim() ?? '';
      await page.getByLabel('6-digit code').fill(new TOTP({ secret }).generate());
      await page.getByRole('button', { name: 'Verify' }).click();
      await expect(page).toHaveURL(/\/en\/dashboard$/);
    } else {
      await page.goto('/en/dashboard');
      await expect(page).toHaveURL(/\/en\/two-factor$/);
    }
  });
});
