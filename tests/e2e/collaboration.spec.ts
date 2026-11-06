import type { Browser, Page } from '@playwright/test';
import { DEMO_PASSWORD, signedInNewBrand, signIn } from './support/accounts';
import { expectAccessible } from './support/accessibility';
import { expect, test, uniqueEmail } from './support/fixtures';

/**
 * Seeded demo creators who are open to collaborations and have a verified mock YouTube
 * channel. Each test and screen size uses its own, so the per-account sign-in limit (SR-3)
 * isn't shared between parallel tests.
 */
const DEMO_CREATORS = {
  desktop: { chat: '18', deal: '21', decline: '27', owner: '33' },
  'mobile-360': { chat: '30', deal: '36', decline: '42', owner: '45' },
} as const;

type Scenario = keyof (typeof DEMO_CREATORS)['desktop'];

function demoCreator(scenario: Scenario) {
  const projectName = test.info().project.name as keyof typeof DEMO_CREATORS;
  const index = DEMO_CREATORS[projectName][scenario];
  return {
    slug: `demo-creator-${index}`,
    email: `demo-creator-${index}@example.test`,
    channel: `mock-yt-seed-${index}`,
  };
}
const DAY_MS = 86_400_000;

function dateInDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/** A second browser for another person, with its own client IP (per-IP rate limits). */
async function otherPersonsPage(browser: Browser): Promise<Page> {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` },
  });
  return context.newPage();
}

/** A demo creator, signed in in a separate browser. */
async function signedInCreator(browser: Browser, email: string): Promise<Page> {
  const page = await otherPersonsPage(browser);
  await signIn(page, email, DEMO_PASSWORD);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  return page;
}

/** Sends a request from the signed-in brand to the demo creator; returns its id. */
async function sendRequest(page: Page, slug: string, campaignName: string): Promise<string> {
  await page.goto(`/en/brand/requests/new?creator=${slug}`);
  await page.getByLabel('Campaign name').fill(campaignName);
  await page
    .getByLabel('Brief', { exact: true })
    .fill('Two reels about our festive sweets box, warm family tone.');
  await page.getByLabel('Reel', { exact: true }).fill('2');
  await page.getByLabel('Content deadline').fill(dateInDays(20));
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page).toHaveURL(/\/en\/brand\/requests\/\w+$/);
  return page.url().split('/').pop() ?? '';
}

/** Five stars on every question of the rating form, then submit. */
async function rateFiveStars(page: Page): Promise<void> {
  const groups = page.getByRole('group').filter({ has: page.getByLabel('5 stars') });
  for (const group of await groups.all()) await group.getByLabel('5 stars').check();
  await page.getByRole('button', { name: 'Submit rating' }).click();
  // The form is replaced by the saved rating once it is submitted.
  await expect(page.getByRole('heading', { name: 'Your rating' })).toBeVisible();
}

test.describe('collaboration', () => {
  // Every test here is a two-person flow (two sign-ups, several pages): about 30 s on a busy
  // machine, the default limit.
  test.slow();

  test('UC-R1 UC-R2 UC-R3 a brand sends a request, the creator accepts and they chat', async ({
    page,
    browser,
  }) => {
    const demo = demoCreator('chat');
    await signedInNewBrand(page, uniqueEmail('collab'));
    const requestId = await sendRequest(page, demo.slug, 'E2E festive campaign');
    await expect(page.getByText('Waiting for answer')).toBeVisible();

    const creator = await signedInCreator(browser, demo.email);
    await creator.goto(`/en/creator/requests/${requestId}`);
    await creator.getByRole('button', { name: 'Accept', exact: true }).click();
    await creator.getByRole('link', { name: 'Open chat' }).click();
    await creator.getByLabel('Message').fill('Happy to work together! WhatsApp me on 98765 43210');
    await creator.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(creator.getByText('Happy to work together!')).toBeVisible();

    await page.goto(`/en/brand/requests/${requestId}`);
    await page.getByRole('link', { name: 'Open chat' }).click();
    await expect(page.getByText('Happy to work together!')).toBeVisible();
    // FR-8.2: contact details in early messages carry a safety note.
    await expect(page.getByText(/This message contains a phone number/)).toBeVisible();
    await creator.context().close();
  });

  test('FR-9 ADR-012 UC-R5 UC-R7 a deal goes from contract to approved work to payment and ratings', async ({
    page,
    browser,
  }) => {
    const demo = demoCreator('deal');
    await signedInNewBrand(page, uniqueEmail('deal'));
    const requestId = await sendRequest(page, demo.slug, 'E2E deal campaign');
    const creator = await signedInCreator(browser, demo.email);
    await creator.goto(`/en/creator/requests/${requestId}`);
    await creator.getByRole('button', { name: 'Accept', exact: true }).click();
    await creator.getByRole('link', { name: 'Open deal' }).click();
    await expect(creator).toHaveURL(/\/en\/deals\/\w+$/);
    const dealPath = new URL(creator.url()).pathname;
    await expect(creator.getByText(/The brand will send a contract/)).toBeVisible();

    // ADR-012: the brand issues the standard contract with the agreed terms.
    await page.goto(dealPath);
    await page.getByLabel('Agreed amount (₹)').fill('30000');
    await page.getByLabel('Advance (%)').fill('30');
    await page.getByLabel('Additional terms (optional)').fill('Tag @spiceco in both reels.');
    await page.getByRole('button', { name: 'Issue contract' }).click();
    // The form folds away once issued; the status shows the creator's turn.
    await expect(page.getByText(/^Waiting for the creator/)).toBeVisible();

    // The creator reads the contract and accepts that version.
    await creator.reload();
    await creator.getByRole('link', { name: 'Read the full contract' }).click();
    await expect(creator.getByRole('heading', { name: 'Collaboration agreement' })).toBeVisible();
    await expect(creator.getByText('Tag @spiceco in both reels.')).toBeVisible();
    await creator.getByLabel('I have read this contract and agree to it.').check();
    await creator.getByRole('button', { name: 'Accept contract' }).click();
    await expect(creator.getByText(/^Accepted by the creator on/)).toBeVisible();
    // NFR-9: the contract page, and the deal page with the proof-of-work form.
    await expectAccessible(creator, [`${dealPath}/contract`, dealPath]);

    // Proof of work with a screenshot; FR-9.5: the disclosure reminder is shown.
    await creator.goto(dealPath);
    await expect(creator.getByText(/label sponsored posts clearly/).first()).toBeVisible();
    const postUrl = `https://mock.social/${demo.channel}/e2e-${Date.now()}`;
    await creator.getByLabel('Links to the work').fill(postUrl);
    await creator.getByLabel('Screenshots or PDFs (optional)').setInputFiles({
      name: 'insights.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    });
    await creator.getByRole('button', { name: 'Submit work for review' }).click();
    await expect(creator.getByText('Waiting for review')).toBeVisible();

    // The brand asks for a change once, then approves the second round.
    // NFR-9: the deal page with the brand's review forms.
    await expectAccessible(page, [dealPath]);
    await expect(page.getByRole('link', { name: 'insights.png' })).toBeVisible();
    await page.getByLabel('What should change?').fill('Please show the box in the first shot.');
    await page.getByRole('button', { name: 'Ask for changes' }).click();
    await expect(page.getByText('Changes requested', { exact: true }).first()).toBeVisible();

    await creator.reload();
    await expect(creator.getByText('Please show the box in the first shot.').first()).toBeVisible();
    await creator.getByLabel('Links to the work').fill(postUrl);
    await creator.getByRole('button', { name: 'Submit work for review' }).click();
    await expect(creator.getByText('Waiting for review')).toBeVisible();

    await page.reload();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Approve work' }).click();
    await expect(page.getByText('Work approved', { exact: true })).toBeVisible();

    // FR-9.3: the creator adds the live post for the campaign report.
    await creator.reload();
    await creator.getByLabel('Link to the published post').fill(postUrl);
    await creator.getByRole('button', { name: 'Add post' }).click();
    await expect(creator.getByText('Post added.', { exact: false })).toBeVisible();

    await page.reload();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Mark as paid' }).click();
    await expect(page.getByText('Waiting for the creator to confirm')).toBeVisible();

    await creator.reload();
    await creator.getByRole('button', { name: 'Yes, I received it' }).click();
    await expect(creator.getByRole('button', { name: 'Submit rating' })).toBeVisible();
    await rateFiveStars(creator);

    await page.reload();
    await rateFiveStars(page);
    await page.reload();
    await expect(page.getByText(/rating of you/)).toBeVisible();

    await page.getByRole('link', { name: 'Deal summary' }).click();
    await expect(page.getByRole('heading', { name: 'Deal summary' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible();
    await creator.context().close();
  });

  test('UC-R2 the creator declines with a reason the brand can read', async ({ page, browser }) => {
    const demo = demoCreator('decline');
    await signedInNewBrand(page, uniqueEmail('decline'));
    const requestId = await sendRequest(page, demo.slug, 'E2E declined campaign');

    const creator = await signedInCreator(browser, demo.email);
    await creator.goto(`/en/creator/requests/${requestId}`);
    await creator
      .getByLabel('Reason (optional, shared with the brand)')
      .fill('Booked until January');
    await creator.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(creator.getByText('Declined', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Reason given: Booked until January')).toBeVisible();
    await creator.context().close();
  });

  test('SEC-2 another brand changing the id in the URL gets "not found"', async ({
    page,
    browser,
  }) => {
    await signedInNewBrand(page, uniqueEmail('owner'));
    const requestId = await sendRequest(page, demoCreator('owner').slug, 'E2E private campaign');

    const intruder = await otherPersonsPage(browser);
    await signedInNewBrand(intruder, uniqueEmail('intruder'));
    await intruder.goto(`/en/brand/requests/${requestId}`);

    await expect(intruder.getByText('Page not found')).toBeVisible();
    await intruder.context().close();
  });
});
