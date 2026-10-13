import type { Clock } from '@/adapters/clock';
import type { PasswordHasher } from '@/adapters/crypto/password-hasher';
import type { TokenCipher } from '@/adapters/crypto/token-cipher';
import type { TotpService } from '@/adapters/crypto/totp';
import type { Repositories } from '@/adapters/db/repositories';
import type { TransactionRunner } from '@/adapters/db/transaction';
import type { JobQueue } from '@/adapters/jobs/job-queue';
import type { BreachedPasswordChecker } from '@/adapters/security/breached-password-checker';
import type { CaptchaVerifier } from '@/adapters/security/captcha-verifier';

/**
 * Everything a service needs, passed in so tests can use fakes (CLAUDE.md §4 "D").
 * Built from the container in the app layer.
 */
export interface ServiceContext {
  readonly repos: Repositories;
  readonly transaction: TransactionRunner;
  readonly clock: Clock;
  readonly passwordHasher: PasswordHasher;
  readonly breachedPasswords: BreachedPasswordChecker;
  readonly captcha: CaptchaVerifier;
  readonly tokenCipher: TokenCipher;
  readonly totp: TotpService;
  readonly jobQueue: JobQueue;
  /** Public base URL for links in emails, e.g. "https://app.example.in". */
  readonly appUrl: string;
}

/** Who is making the request; used for rate limits, audit logs and device checks. */
export interface RequestInfo {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /** Interface language for any emails this request triggers. */
  readonly locale: string;
}
