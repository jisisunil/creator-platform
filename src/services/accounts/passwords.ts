import { validationFailed } from '@/domain/errors';
import { findPasswordProblem } from '@/domain/password-policy';
import type { ServiceContext } from '../context';

/**
 * Applies every password rule (SR-1): length, not containing the email, and not in a
 * known breach. Throws VALIDATION_FAILED on the given field; returns the Argon2id hash.
 */
export async function hashAcceptablePassword(
  ctx: ServiceContext,
  password: string,
  email: string,
  field = 'password',
): Promise<string> {
  const problem = findPasswordProblem(password, email);
  if (problem) throw validationFailed({ [field]: `password.${problem}` });
  if (await ctx.breachedPasswords.isBreached(password)) {
    throw validationFailed({ [field]: 'password.breached' });
  }
  return ctx.passwordHasher.hash(password);
}
