import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { TOTP } from 'otpauth';
import { DEMO_PASSWORD, signIn } from './support/accounts';
import { expect, test } from './support/fixtures';

/** NFR-9: WCAG 2.1 A and AA rules. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Checks one page and returns readable failures (empty when it passes). */
async function violationsOn(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (violation) =>
      `${path}: ${violation.id} (${violation.impact}) ${violation.help} → ${violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | ')}`,
  );
}

async function expectAccessible(page: Page, paths: readonly string[]): Promise<void> {
  const failures: string[] = [];
  for (const path of paths) failures.push(...(await violationsOn(page, path)));
  expect(failures, failures.join('\n')).toEqual([]);
}

test.describe('accessibility (NFR-9, WCAG 2.1 AA)', () => {
  test.slow();

  test('NFR-9 public pages', async ({ page }) => {
    await expectAccessible(page, [
      '/en',
      '/hi',
      '/en/sign-in',
      '/en/sign-up',
      '/en/forgot-password',
      '/en/privacy',
      '/en/terms',
      '/en/grievance',
      '/en/c/demo-creator-03',
    ]);
  });

  test('NFR-9 creator pages', async ({ page }) => {
    await signIn(page, 'demo-creator-03@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectAccessible(page, [
      '/en/dashboard',
      '/en/creator/profile',
      '/en/creator/accounts',
      '/en/creator/analytics',
      '/en/creator/requests',
      '/en/deals',
      '/en/messages',
      '/en/notifications',
      '/en/settings',
    ]);
  });

  test('NFR-9 brand pages', async ({ page }) => {
    await signIn(page, 'brand-owner@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectAccessible(page, [
      '/en/brand/search',
      '/en/brand/creators/demo-creator-03',
      '/en/brand/shortlists',
      '/en/brand/saved-searches',
      '/en/brand/requests',
      '/en/brand/requests/new?creator=demo-creator-21',
      '/en/brand/campaigns',
      '/en/brand/plan',
      '/en/brand/team',
      '/en/deals',
    ]);
  });

  test('NFR-9 admin pages', async ({ page }) => {
    await signIn(page, 'ops-admin@example.test', DEMO_PASSWORD);
    await page.getByLabel('6-digit code').fill(new TOTP({ secret: 'JBSWY3DPEHPK3PXP' }).generate());
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    await expectAccessible(page, [
      '/en/admin',
      '/en/admin/users',
      '/en/admin/reports',
      '/en/admin/flags',
      '/en/admin/disputes',
      '/en/admin/data-requests',
      '/en/admin/audit',
    ]);
  });
});
