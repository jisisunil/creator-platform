import { hash, verify } from '@node-rs/argon2';

/** Hashes and checks passwords (SR-1). Implementations must be slow and salted. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** False for a wrong password or a malformed hash; never throws for either. */
  verify(passwordHash: string, password: string): Promise<boolean>;
  /**
   * Spends the same time as a real check. Called when the account doesn't exist, so
   * response timing doesn't reveal which emails are registered (SR-3).
   */
  verifyAgainstDummy(password: string): Promise<void>;
}

// OWASP-recommended Argon2id parameters (19 MiB memory, 2 iterations, 1 lane).
// Argon2id is the library's default algorithm.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Argon2id password hashing via @node-rs/argon2 (SR-1). */
export function createArgon2PasswordHasher(): PasswordHasher {
  let dummyHash: Promise<string> | undefined;
  return {
    hash: (password) => hash(password, ARGON2_OPTIONS),
    async verify(passwordHash, password) {
      try {
        return await verify(passwordHash, password);
      } catch {
        // A malformed stored hash is a failed check, not a crash.
        return false;
      }
    },
    async verifyAgainstDummy(password) {
      dummyHash ??= hash('dummy-password-for-timing', ARGON2_OPTIONS);
      await verify(await dummyHash, password);
    },
  };
}
