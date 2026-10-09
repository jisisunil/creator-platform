import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // NFR-5: mobile-first; CLAUDE.md §10 asks for 360px checks.
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  ],
  webServer: {
    // Always the production build: realistic, and nothing compiles on demand during tests.
    // CI builds in an earlier step.
    command: isCi ? `npm run start -- -p ${PORT}` : `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !isCi,
    timeout: 300_000,
  },
});
