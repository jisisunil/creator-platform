import {
  databasePoolOptions,
  directDatabaseUrl,
  getServerEnv,
  socialProviderSettings,
} from '@/config/env';
import type { ServiceContext } from '@/services/context';
import { type Clock, systemClock } from './clock';
import { createArgon2PasswordHasher } from './crypto/password-hasher';
import { createAesGcmTokenCipher } from './crypto/token-cipher';
import { createTotpService } from './crypto/totp';
import { createDatabaseClient, type DatabaseClient } from './db/client';
import type { HealthRepository } from './db/health-repository';
import { createRepositories } from './db/repositories';
import { createTransactionRunner } from './db/transaction';
import { createSmtpEmailSender, type EmailSender } from './email/email-sender';
import { createPgBossJobQueue } from './jobs/job-queue';
import { createClamAvScanner, disabledMalwareScanner } from './scan/malware-scanner';
import {
  createHibpBreachedPasswordChecker,
  createOfflineBreachedPasswordChecker,
} from './security/breached-password-checker';
import {
  createTurnstileCaptchaVerifier,
  disabledCaptchaVerifier,
} from './security/captcha-verifier';
import { createSocialProviderRegistry } from './social/registry';
import { createLocalFileStorage } from './storage/file-storage';

/** Every concrete adapter, wired in one place (CLAUDE.md §4). */
export interface Container extends ServiceContext {
  readonly db: DatabaseClient;
  readonly clock: Clock;
  readonly healthRepository: HealthRepository;
  readonly emailSender: EmailSender;
}

function buildContainer(): Container {
  const env = getServerEnv();
  const db = createDatabaseClient(env.DATABASE_URL, databasePoolOptions(env));
  const repos = createRepositories(db);
  return {
    db,
    repos,
    transaction: createTransactionRunner(db),
    clock: systemClock,
    healthRepository: repos.health,
    passwordHasher: createArgon2PasswordHasher(),
    breachedPasswords:
      env.BREACHED_PASSWORD_CHECK === 'hibp'
        ? createHibpBreachedPasswordChecker()
        : createOfflineBreachedPasswordChecker(),
    captcha: env.TURNSTILE_SECRET_KEY
      ? createTurnstileCaptchaVerifier(env.TURNSTILE_SECRET_KEY)
      : disabledCaptchaVerifier,
    tokenCipher: createAesGcmTokenCipher(env.TOKEN_ENCRYPTION_KEY),
    totp: createTotpService(),
    jobQueue: createPgBossJobQueue(directDatabaseUrl(env)),
    emailSender: createSmtpEmailSender(env.SMTP_URL, env.EMAIL_FROM),
    socialProviders: createSocialProviderRegistry(socialProviderSettings(env)),
    fileStorage: createLocalFileStorage(env.FILE_STORAGE_DIR),
    malwareScanner:
      env.MALWARE_SCANNER === 'clamav'
        ? createClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT)
        : disabledMalwareScanner,
    appUrl: env.APP_URL,
  };
}

// Kept on globalThis so Next.js dev hot reloads don't open a new connection pool each time.
const globalForContainer = globalThis as unknown as { container?: Container };

/** The application's adapters. Built lazily on first use. */
export function getContainer(): Container {
  globalForContainer.container ??= buildContainer();
  return globalForContainer.container;
}
