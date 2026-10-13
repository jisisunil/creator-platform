import { test as base } from '@playwright/test';

export const PASSWORD = 'e2e-correct-horse-battery';

let counter = 0;

/** A unique, clearly fake email per test run. */
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}@example.test`;
}

/**
 * Every test gets its own client IP (the app trusts one proxy hop in E2E), so per-IP rate
 * limits behave as they would for separate real users.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const octet = () => Math.floor(Math.random() * 250) + 1;
    await provide({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` });
  },
});

export { expect } from '@playwright/test';
