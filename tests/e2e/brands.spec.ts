import { DEMO_PASSWORD, signedInNewBrand, signIn } from './support/accounts';
import { expect, test, uniqueEmail } from './support/fixtures';

test.describe('brand discovery', () => {
  test('FR-5.1 a brand filters by state and category and opens a profile', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('search'));
    await page.goto('/en/brand/search');

    await page.getByLabel('State').selectOption({ label: 'Tamil Nadu' });
    await page.getByLabel('Food', { exact: true }).check();
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page).toHaveURL(/state=TN/);
    await expect(page).toHaveURL(/category=food/);
    const firstCard = page.locator('article').first();
    await expect(firstCard).toBeVisible();
    await firstCard.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/en\/brand\/creators\//);
    await expect(page.getByText('Authenticity', { exact: true })).toBeVisible();
  });

  test('FR-5.3 an empty search suggests widening it', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('widen'));

    await page.goto('/en/brand/search?state=TN&city=Nowhere-Town');

    await expect(page.getByText('No creators match these filters.')).toBeVisible();
    await page.getByRole('link', { name: 'Search the whole state' }).click();
    await expect(page).not.toHaveURL(/city=/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('FR-6 a brand builds a shortlist, adds a note and downloads CSV', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('shortlist'));
    await page.goto('/en/brand/shortlists');
    await page.getByLabel('Name').fill('Diwali campaign');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { name: 'Diwali campaign' })).toBeVisible();

    await page.goto('/en/brand/search');
    const card = page.locator('article').first();
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByText('Added.')).toBeVisible();

    await page.goto('/en/brand/shortlists');
    await page.getByRole('link', { name: 'Diwali campaign' }).click();
    await page.getByLabel('Note').first().fill('Great reels, ask for rates');
    await page.getByRole('button', { name: 'Save note' }).first().click();
    await expect(page.getByText('Note saved.')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download CSV' }).click();
    expect((await download).suggestedFilename()).toBe('Diwali-campaign.csv');
  });

  test('UC-D4 a brand compares two creators side by side', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('compare'));
    await page.goto('/en/brand/search');

    const boxes = page.getByRole('checkbox', { name: /^Select .* to compare$/ });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Compare selected' }).click();

    await expect(page).toHaveURL(/\/en\/brand\/compare\?ids=/);
    await expect(page.getByRole('columnheader')).toHaveCount(3);
    await expect(page.getByRole('rowheader', { name: 'Score' })).toBeVisible();
  });

  test('FR-5.4 a brand saves a search and reruns it', async ({ page }) => {
    await signedInNewBrand(page, uniqueEmail('saved'));
    await page.goto('/en/brand/search?state=KA');
    await page.getByLabel('Name', { exact: true }).fill('Karnataka creators');
    await page.getByRole('button', { name: 'Save search' }).click();
    await expect(page.getByText('Search saved.')).toBeVisible();

    await page.goto('/en/brand/saved-searches');
    await page.getByRole('link', { name: 'Run' }).click();

    await expect(page).toHaveURL(/\/en\/brand\/search\?state=KA/);
  });

  test('SR-5 creators cannot open brand pages', async ({ page }) => {
    await signIn(page, 'demo-creator-02@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);

    await page.goto('/en/brand/search');

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});
