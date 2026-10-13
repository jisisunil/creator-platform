import { createArgon2PasswordHasher } from '@/adapters/crypto/password-hasher';
import type { DatabaseClient } from '@/adapters/db/client';
import { createRepositories } from '@/adapters/db/repositories';
import { createTransactionRunner } from '@/adapters/db/transaction';
import { LAUNCH_COUNTRY_CODE } from '@/config/countries';
import { createAccount } from '@/services/accounts';

/** Shared password for every demo account. Development only; the seed refuses production. */
export const DEMO_PASSWORD = 'Demo-Password-2026';

/** Clearly fake accounts on the reserved example.test domain. */
export const DEMO_ACCOUNTS = {
  admin: 'admin@example.test',
  creator: 'creator@example.test',
  brandOwner: 'brand-owner@example.test',
} as const;

/** Creates the demo admin, creator and brand owner if they don't exist yet. */
export async function seedDemoAccounts(db: DatabaseClient): Promise<void> {
  const repos = createRepositories(db);
  const transaction = createTransactionRunner(db);
  const passwordHash = await createArgon2PasswordHasher().hash(DEMO_PASSWORD);
  const now = new Date();

  if (!(await repos.users.findByEmail(DEMO_ACCOUNTS.creator))) {
    await transaction((tx) =>
      createAccount(
        tx,
        now,
        {
          role: 'CREATOR',
          name: 'Demo Creator',
          email: DEMO_ACCOUNTS.creator,
          passwordHash,
          locale: 'en',
          acceptsMarketing: false,
          emailVerifiedAt: now,
        },
        null,
      ),
    );
  }

  if (!(await repos.users.findByEmail(DEMO_ACCOUNTS.brandOwner))) {
    await transaction((tx) =>
      createAccount(
        tx,
        now,
        {
          role: 'BRAND',
          name: 'Demo Brand Owner',
          email: DEMO_ACCOUNTS.brandOwner,
          passwordHash,
          locale: 'en',
          acceptsMarketing: false,
          emailVerifiedAt: now,
          brand: { name: 'Demo Spices Co (fake)', industry: 'food-beverage' },
        },
        null,
      ),
    );
  }

  // Admins never come from sign-up; the TOTP is set up on first sign-in (SR-4).
  if (!(await repos.users.findByEmail(DEMO_ACCOUNTS.admin))) {
    const country = await repos.reference.findCountry(LAUNCH_COUNTRY_CODE);
    if (!country) throw new Error('Seed reference data first.');
    await transaction(async (tx) => {
      const admin = await tx.users.create({
        email: DEMO_ACCOUNTS.admin,
        passwordHash,
        name: 'Demo Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        countryCode: country.code,
        locale: 'en',
      });
      await tx.consents.append(
        admin.id,
        [
          {
            kind: 'AGE_CONFIRMATION',
            isGranted: true,
            noticeVersion: country.privacyNoticeVersion,
          },
          { kind: 'PRIVACY_NOTICE', isGranted: true, noticeVersion: country.privacyNoticeVersion },
          { kind: 'MARKETING', isGranted: false, noticeVersion: country.privacyNoticeVersion },
        ],
        null,
      );
    });
  }
}
