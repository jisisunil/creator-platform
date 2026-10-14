import { createArgon2PasswordHasher } from '@/adapters/crypto/password-hasher';
import { createAesGcmTokenCipher } from '@/adapters/crypto/token-cipher';
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
  /** An admin with two-factor already set up, for automated tests of the admin console. */
  opsAdmin: 'ops-admin@example.test',
  creator: 'creator@example.test',
  brandOwner: 'brand-owner@example.test',
} as const;

/**
 * The ops admin's authenticator secret (a well-known example value). Development and tests
 * only: the seed refuses to run in production, and real admins set up their own.
 */
export const DEMO_OPS_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/** Creates the demo admins, creator and brand owner if they don't exist yet. */
export async function seedDemoAccounts(
  db: DatabaseClient,
  tokenEncryptionKey: string,
): Promise<void> {
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

  // Admins never come from sign-up. The demo admin sets up TOTP on first sign-in (SR-4);
  // the ops admin has it already, so end-to-end tests can sign in.
  const cipher = createAesGcmTokenCipher(tokenEncryptionKey);
  for (const [email, name, totpSecret] of [
    [DEMO_ACCOUNTS.admin, 'Demo Admin', null],
    [DEMO_ACCOUNTS.opsAdmin, 'Ops Admin (demo)', DEMO_OPS_ADMIN_TOTP_SECRET],
  ] as const) {
    if (await repos.users.findByEmail(email)) continue;
    const country = await repos.reference.findCountry(LAUNCH_COUNTRY_CODE);
    if (!country) throw new Error('Seed reference data first.');
    await transaction(async (tx) => {
      const admin = await tx.users.create({
        email,
        passwordHash,
        name,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: now,
        countryCode: country.code,
        locale: 'en',
      });
      if (totpSecret) {
        await tx.users.setTotpSecret(admin.id, cipher.encrypt(totpSecret));
        await tx.users.enableTotp(admin.id, now);
      }
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
