import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { DEMO_PASSWORD, signIn } from './support/accounts';
import { expect, test } from './support/fixtures';

/** NFR-1: pages load in under 2 seconds on a 4G phone. */
const LOAD_BUDGET_MS = 2000;

/**
 * Lighthouse's mobile throttling, a deliberately pessimistic "4G phone": 150 ms round trips,
 * 1.6 Mbit/s down, 750 kbit/s up, and a CPU four times slower than this machine.
 */
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};
const CPU_SLOWDOWN = 4;
/**
 * Each page gets this many first visits, each from a brand-new browser profile (no cache,
 * no open connection, no compiled scripts); the median absorbs noise from other tests.
 */
const VISITS = 3;

async function throttle(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
}

/** Largest Contentful Paint: when the page's main content became visible. */
async function largestContentfulPaint(page: Page, path: string): Promise<number> {
  await page.goto(path, { waitUntil: 'load' });
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1]?.startTime ?? 0);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }),
  );
}

/** Median paint time of several first visits. The server is warmed first, as in production. */
async function medianFirstVisitPaint(input: {
  browser: Browser;
  path: string;
  options: BrowserContextOptions;
}): Promise<number> {
  const times: number[] = [];
  for (let visit = 0; visit < VISITS; visit += 1) {
    const context = await input.browser.newContext(input.options);
    const page = await context.newPage();
    if (visit === 0) await page.request.get(input.path);
    await throttle(page);
    times.push(await largestContentfulPaint(page, input.path));
    await context.close();
  }
  times.sort((first, second) => first - second);
  const median = times[Math.floor(times.length / 2)] ?? Number.POSITIVE_INFINITY;
  test.info().annotations.push({
    type: 'largest-contentful-paint',
    description: `${input.path}: median ${Math.round(median)} ms of ${times.map(Math.round).join(', ')}`,
  });
  return median;
}

test.describe('page speed on a 4G phone (NFR-1)', () => {
  test.describe.configure({ mode: 'serial' });
  test.slow();
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'mobile-360',
      'Throttling uses the Chromium DevTools protocol; measured once, at phone size',
    );
  });

  for (const path of ['/en', '/en/sign-in', '/en/c/demo-creator-03']) {
    test(`NFR-1 ${path} shows its content within 2 s`, async ({
      browser,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      baseURL,
    }) => {
      const options = { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, baseURL };

      const paintMs = await medianFirstVisitPaint({ browser, path, options });

      expect(paintMs, `${path}: ${Math.round(paintMs)} ms`).toBeLessThan(LOAD_BUDGET_MS);
    });
  }

  test('NFR-1 brand search shows results within 2 s', async ({
    page,
    browser,
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
  }) => {
    await signIn(page, 'brand-owner@example.test', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
    // Fresh profiles each time, but signed in (the session cookie only).
    const storageState = await page.context().storageState();
    const options = {
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      baseURL,
      storageState,
    };

    const paintMs = await medianFirstVisitPaint({ browser, path: '/en/brand/search', options });

    expect(paintMs, `search: ${Math.round(paintMs)} ms`).toBeLessThan(LOAD_BUDGET_MS);
  });
});
