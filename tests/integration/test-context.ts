import { randomBytes } from 'node:crypto';
import { createArgon2PasswordHasher } from '@/adapters/crypto/password-hasher';
import { createAesGcmTokenCipher } from '@/adapters/crypto/token-cipher';
import { createTotpService } from '@/adapters/crypto/totp';
import type { DatabaseClient } from '@/adapters/db/client';
import { createRepositories } from '@/adapters/db/repositories';
import { createTransactionRunner } from '@/adapters/db/transaction';
import { disabledMalwareScanner } from '@/adapters/scan/malware-scanner';
import { createSocialProviderRegistry } from '@/adapters/social/registry';
import { createInMemoryFileStorage } from '../fakes/in-memory-file-storage';
import type { JobName } from '@/config/jobs';
import type { RequestInfo, ServiceContext } from '@/services/context';
import { seedChangeableReferenceData } from '../../prisma/seed/reference-data';
import { type MutableClock, mutableClock } from '../fakes/mutable-clock';

export const VALID_CAPTCHA = 'valid-captcha-token';
export const STRONG_PASSWORD = 'correct-horse-battery';

export interface TestContext extends ServiceContext {
  readonly clock: MutableClock;
  readonly enqueuedJobs: JobName[];
  /** Turn the CAPTCHA requirement on for a test (off by default, as in development). */
  setCaptchaEnabled(isEnabled: boolean): void;
  readonly breachedPasswordList: Set<string>;
}

/**
 * Real repositories on the test database, with fakes only for the outside world: clock,
 * CAPTCHA, breached-password lookup and job queue (CLAUDE.md §11).
 */
export function createTestContext(db: DatabaseClient): TestContext {
  const enqueuedJobs: JobName[] = [];
  const breachedPasswordList = new Set<string>(['password123456']);
  let isCaptchaEnabled = false;
  return {
    repos: createRepositories(db),
    transaction: createTransactionRunner(db),
    clock: mutableClock('2026-10-09T10:00:00Z'),
    passwordHasher: createArgon2PasswordHasher(),
    breachedPasswords: { isBreached: async (password) => breachedPasswordList.has(password) },
    get captcha() {
      return {
        isEnabled: isCaptchaEnabled,
        verify: async (token: string | null) => token === VALID_CAPTCHA,
      };
    },
    tokenCipher: createAesGcmTokenCipher(randomBytes(32).toString('base64')),
    totp: createTotpService(),
    jobQueue: {
      enqueue: async (name) => {
        enqueuedJobs.push(name);
      },
    },
    appUrl: 'https://app.test',
    socialProviders: createSocialProviderRegistry({ mode: 'mock', appUrl: 'https://app.test' }),
    fileStorage: createInMemoryFileStorage(),
    malwareScanner: disabledMalwareScanner,
    enqueuedJobs,
    breachedPasswordList,
    setCaptchaEnabled(isEnabled) {
      isCaptchaEnabled = isEnabled;
    },
  };
}

/** A request from a given IP, in English unless stated. */
export function requestFrom(
  ipAddress = '203.0.113.10',
  userAgent = 'TestBrowser/1.0',
): RequestInfo {
  return { ipAddress, userAgent, locale: 'en' };
}

/** Tables tests never change; everything else is emptied before each test. */
const KEPT_TABLES = ['_prisma_migrations', 'CountrySettings', 'Language', 'Category'];

/**
 * Removes everything tests create, keeping reference data, then re-seeds reference data.
 * Rows are deleted rather than truncated: TRUNCATE rewrites every table and index file,
 * which took 2.5 s per test on Docker for Windows; DELETE on these small tables is quick.
 * Foreign-key checks are paused for this statement only (needs the test superuser).
 */
export async function resetDatabase(db: DatabaseClient): Promise<void> {
  const kept = KEPT_TABLES.map((table) => `'${table}'`).join(', ');
  await db.$executeRawUnsafe(`
    DO $$
    DECLARE table_name text;
    BEGIN
      SET LOCAL session_replication_role = replica;
      FOR table_name IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN (${kept})
      LOOP
        EXECUTE format('DELETE FROM %I', table_name);
      END LOOP;
    END $$;
  `);
  await seedChangeableReferenceData(db);
}

/** Pulls the token out of the newest queued email link of a template. */
export async function latestEmailLink(
  db: DatabaseClient,
  template: string,
  toAddress: string,
): Promise<string> {
  const email = await db.emailOutbox.findFirst({
    where: { template, toAddress },
    orderBy: { createdAt: 'desc' },
  });
  const payload = email?.payload as { link?: string } | null;
  if (!payload?.link) throw new Error(`No ${template} email with a link for ${toAddress}`);
  return payload.link;
}

/** The `token` query parameter (or last path segment) of an emailed link. */
export function tokenFromLink(link: string): string {
  const url = new URL(link);
  return url.searchParams.get('token') ?? url.pathname.split('/').pop() ?? '';
}
