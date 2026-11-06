import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

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

/** NFR-9: opens each page and fails with every WCAG 2.1 AA violation found. */
export async function expectAccessible(page: Page, paths: readonly string[]): Promise<void> {
  const failures: string[] = [];
  for (const path of paths) failures.push(...(await violationsOn(page, path)));
  expect(failures, failures.join('\n')).toEqual([]);
}
