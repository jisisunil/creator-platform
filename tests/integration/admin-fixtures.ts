import type { UserRecord } from '@/adapters/db/user-repository';
import type { TestContext } from './test-context';

/** An active admin account (admins are created by operators, never by sign-up). */
export function createAdmin(ctx: TestContext, email = 'admin@platform.in'): Promise<UserRecord> {
  return ctx.repos.users.create({
    email,
    passwordHash: null,
    name: 'Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    emailVerifiedAt: ctx.clock.now(),
    countryCode: 'IN',
    locale: 'en',
  });
}
