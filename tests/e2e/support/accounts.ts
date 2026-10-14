import type { Page } from '@playwright/test';
import { expect, PASSWORD } from './fixtures';
import { linkFromEmail } from './mailpit';

/** Seeded demo accounts (prisma/seed); all share this password. */
export const DEMO_PASSWORD = 'Demo-Password-2026';

/** Signs up a creator through the real form; lands on "check your inbox". */
export async function signUpCreator(page: Page, email: string): Promise<void> {
  await page.goto('/en/sign-up');
  await page.getByLabel('Your name').fill('E2E Creator');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('I confirm I am 18 or older').check();
  await page.getByLabel(/I have read and agree to the/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/check-email$/);
}

/** Opens the verification email from Mailpit and confirms it. */
export async function verifyFromEmail(page: Page, email: string): Promise<void> {
  const link = await linkFromEmail(email, /Verify your email/, '/verify-email');
  await page.goto(link);
  await page.getByRole('button', { name: 'Verify your email' }).click();
  await expect(page.getByText('Your email is verified')).toBeVisible();
}

/** Submits the sign-in form; callers assert where it lands. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/en/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** A new, verified, signed-in creator. */
export async function signedInNewCreator(page: Page, email: string): Promise<void> {
  await signUpCreator(page, email);
  await verifyFromEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

/** A new, verified, signed-in brand owner (free beta plan: every discovery feature). */
export async function signedInNewBrand(page: Page, email: string): Promise<void> {
  await page.goto('/en/sign-up?role=BRAND');
  await page.getByLabel('Your name').fill('E2E Brand Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Brand name').fill('E2E Spices (fake)');
  await page.getByLabel('Industry').selectOption({ label: 'Food and beverage' });
  await page.getByLabel('I confirm I am 18 or older').check();
  await page.getByLabel(/I have read and agree to the/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/check-email$/);
  await verifyFromEmail(page, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}
