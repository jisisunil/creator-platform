import type { DatabaseClient } from '@/adapters/db/client';
import type { UserRecord } from '@/adapters/db/user-repository';
import { signUpWithPassword, verifyEmail } from '@/services/accounts';
import {
  latestEmailLink,
  requestFrom,
  STRONG_PASSWORD,
  type TestContext,
  tokenFromLink,
} from '../test-context';

let nextIpSuffix = 1;

/** Signs up and verifies a creator or brand owner through the real services. */
export async function createVerifiedUser(
  ctx: TestContext,
  db: DatabaseClient,
  options: { email: string; role?: 'CREATOR' | 'BRAND'; password?: string },
): Promise<UserRecord> {
  const role = options.role ?? 'CREATOR';
  // A distinct IP per sign-up keeps fixtures clear of the per-IP sign-up limit.
  nextIpSuffix += 1;
  await signUpWithPassword(
    ctx,
    {
      role,
      name: `Test ${role.toLowerCase()}`,
      email: options.email,
      password: options.password ?? STRONG_PASSWORD,
      acceptsMarketing: false,
      brandName: role === 'BRAND' ? 'Test Brand Pvt Ltd' : undefined,
      industry: role === 'BRAND' ? 'food-beverage' : undefined,
      captchaToken: null,
    },
    requestFrom(`198.51.100.${nextIpSuffix % 250}`),
  );
  const link = await latestEmailLink(db, 'verifyEmail', options.email);
  await verifyEmail(ctx, tokenFromLink(link), requestFrom());
  const user = await ctx.repos.users.findByEmail(options.email);
  if (!user) throw new Error('user not created');
  return user;
}
