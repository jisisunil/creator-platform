import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const isCi = Boolean(process.env.CI);

// E2E trusts one proxy hop so each test can present its own client IP (tests/e2e/support),
// and checks passwords against the offline list: tests make no calls to outside services.
const serverEnv = {
  TRUSTED_PROXY_HOPS: '1',
  APP_URL: `http://localhost:${PORT}`,
  BREACHED_PASSWORD_CHECK: 'offline',
  // The worker's "worker started" line (info level) tells Playwright it is ready. CI sets
  // LOG_LEVEL=warn for the unit tests, which hid it and timed out every E2E run.
  LOG_LEVEL: 'info',
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Sign-ups and sign-ins hash passwords with Argon2 on purpose (slow); too many at once
  // overloads one dev machine or CI runner.
  workers: isCi ? 2 : 4,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  // Sign-up and sign-in hash passwords with Argon2, which is slow by design.
  expect: { timeout: 15_000 },
  // In CI, each failure also becomes a GitHub annotation, readable without the full log.
  reporter: isCi ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // NFR-5: mobile-first; CLAUDE.md §10 asks for 360px checks.
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  ],
  webServer: [
    {
      // The production build: realistic, and nothing compiles on demand during tests.
      // `npm run test:e2e` builds first; CI builds in an earlier step.
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      env: serverEnv,
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
    {
      // The worker sends the emails the tests read from Mailpit.
      command: 'npm run worker',
      env: serverEnv,
      wait: { stdout: /worker started/ },
      reuseExistingServer: !isCi,
      timeout: 60_000,
    },
  ],
});
