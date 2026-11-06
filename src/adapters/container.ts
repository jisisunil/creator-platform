import {
  databasePoolOptions,
  directDatabaseUrl,
  getServerEnv,
  type ServerEnv,
  razorpaySettings,
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
import { fakePaymentGateway } from './payments/fake-payment-gateway';
import type { PaymentGateway } from './payments/payment-gateway';
import { createRazorpayGateway } from './payments/razorpay-gateway';
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
import { createLocalFileStorage, type FileStorage } from './storage/file-storage';
import { createS3Client, createS3FileStorage } from './storage/s3-file-storage';

/** Every concrete adapter, wired in one place (CLAUDE.md §4). */
export interface Container extends ServiceContext {
  readonly db: DatabaseClient;
  readonly clock: Clock;
  readonly healthRepository: HealthRepository;
  readonly emailSender: EmailSender;
}

function fileStorageFor(env: ServerEnv): FileStorage {
  if (env.FILE_STORAGE === 's3' && env.S3_BUCKET) {
    return createS3FileStorage(createS3Client(env.AWS_REGION), env.S3_BUCKET);
  }
  return createLocalFileStorage(env.FILE_STORAGE_DIR);
}

/** ADR-013: the gateway that holds payments, or null when brands pay creators directly. */
function paymentGatewayFor(env: ServerEnv): PaymentGateway | null {
  if (env.PAYMENTS_MODE === 'fake') return fakePaymentGateway;
  const razorpay = razorpaySettings(env);
  return razorpay ? createRazorpayGateway(razorpay) : null;
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
    fileStorage: fileStorageFor(env),
    malwareScanner:
      env.MALWARE_SCANNER === 'clamav'
        ? createClamAvScanner(env.CLAMAV_HOST, env.CLAMAV_PORT)
        : disabledMalwareScanner,
    paymentGateway: paymentGatewayFor(env),
    appUrl: env.APP_URL,
    signUpAllowlist: env.SIGNUP_ALLOWLIST,
  };
}

// Kept on globalThis so Next.js dev hot reloads don't open a new connection pool each time.
const globalForContainer = globalThis as unknown as { container?: Container };

/** The application's adapters. Built lazily on first use. */
export function getContainer(): Container {
  globalForContainer.container ??= buildContainer();
  return globalForContainer.container;
}
