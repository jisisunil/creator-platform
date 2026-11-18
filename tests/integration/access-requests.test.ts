import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveAccessRequest,
  declineAccessRequest,
  listAccessRequests,
  requestAccess,
} from '@/services/access-requests';
import { signUpWithPassword } from '@/services/accounts';
import { purgeExpiredSecurityData } from '@/services/retention';
import { createVerifiedUser } from './accounts/fixtures';
import { createAdmin } from './admin-fixtures';
import { createTestDatabaseClient } from './test-database';
import {
  createTestContext,
  latestEmailLink,
  requestFrom,
  resetDatabase,
  STRONG_PASSWORD,
  type TestContext,
} from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;
let pilot: TestContext;

const DAY_MS = 86_400_000;

const asha = {
  role: 'CREATOR' as const,
  name: 'Asha Creator',
  email: 'Asha@Example.in',
  city: 'Kochi',
  profileUrl: 'https://instagram.com/asha.cooks',
  captchaToken: null,
};

const signUpAsAsha = (context: TestContext) =>
  signUpWithPassword(
    context,
    {
      role: 'CREATOR',
      name: 'Asha Creator',
      email: 'asha@example.in',
      password: STRONG_PASSWORD,
      acceptsMarketing: false,
      captchaToken: null,
    },
    requestFrom(),
  );

async function pendingRequestId(): Promise<string> {
  return (await db.accessRequest.findUniqueOrThrow({ where: { email: 'asha@example.in' } })).id;
}

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
  pilot = { ...ctx, signUpAllowlist: ['founder@example.in'] };
});
afterAll(() => db.$disconnect());

describe('pilot waitlist', () => {
  it('stores one request per address, normalised; asking again changes nothing', async () => {
    await requestAccess(pilot, asha, requestFrom());
    await requestAccess(pilot, { ...asha, name: 'Someone Else' }, requestFrom());

    const rows = await db.accessRequest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'asha@example.in',
      name: 'Asha Creator',
      role: 'CREATOR',
      city: 'Kochi',
      status: 'PENDING',
      locale: 'en',
    });
  });

  it('answers the same for invited or registered addresses, without storing them', async () => {
    await createVerifiedUser(ctx, db, { email: 'member@example.in', role: 'BRAND' });

    await requestAccess(pilot, { ...asha, email: 'Founder@Example.in' }, requestFrom());
    await requestAccess(pilot, { ...asha, email: 'member@example.in' }, requestFrom());

    expect(await db.accessRequest.count()).toBe(0);
  });

  it('is closed when sign-up is open to everyone', async () => {
    await expect(requestAccess(ctx, asha, requestFrom())).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  it('rate-limits requests per IP', async () => {
    for (let index = 0; index < 5; index += 1) {
      await requestAccess(pilot, { ...asha, email: `person${index}@example.in` }, requestFrom());
    }
    await expect(requestAccess(pilot, asha, requestFrom())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('a waiting request does not let the person sign up', async () => {
    await requestAccess(pilot, asha, requestFrom());

    await expect(signUpAsAsha(pilot)).rejects.toMatchObject({
      fieldErrors: { email: 'email.inviteOnly' },
    });
  });

  it('approval emails a sign-up link; signing up then works and removes the request', async () => {
    const admin = await createAdmin(ctx);
    await requestAccess(pilot, asha, requestFrom());

    await approveAccessRequest(pilot, {
      adminUserId: admin.id,
      requestId: await pendingRequestId(),
      request: requestFrom(),
    });

    const link = await latestEmailLink(db, 'accessApproved', 'asha@example.in');
    expect(link).toBe('https://app.test/en/sign-up?role=CREATOR');
    await signUpAsAsha(pilot);
    expect(await db.user.count({ where: { email: 'asha@example.in' } })).toBe(1);
    expect(await db.accessRequest.count()).toBe(0);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'access-request.approved' },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('asha@');
  });

  it('declining deletes the request; handling it twice is not found', async () => {
    const admin = await createAdmin(ctx);
    await requestAccess(pilot, asha, requestFrom());
    const requestId = await pendingRequestId();
    const input = { adminUserId: admin.id, requestId, request: requestFrom() };

    await declineAccessRequest(pilot, input);

    expect(await db.accessRequest.count()).toBe(0);
    await expect(declineAccessRequest(pilot, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(approveAccessRequest(pilot, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('only admins can see or handle requests', async () => {
    const creator = await createVerifiedUser(ctx, db, { email: 'other@example.in' });
    await requestAccess(pilot, asha, requestFrom());
    const input = {
      adminUserId: creator.id,
      requestId: await pendingRequestId(),
      request: requestFrom(),
    };

    await expect(
      listAccessRequests(pilot, { adminUserId: creator.id, status: 'PENDING', page: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(approveAccessRequest(pilot, input)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    await expect(declineAccessRequest(pilot, input)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    expect(await db.accessRequest.count({ where: { status: 'PENDING' } })).toBe(1);
  });

  it('lists waiting requests oldest first', async () => {
    const admin = await createAdmin(ctx);
    await requestAccess(pilot, asha, requestFrom());
    await requestAccess(
      pilot,
      { ...asha, email: 'brand@example.in', role: 'BRAND' },
      requestFrom(),
    );

    const result = await listAccessRequests(pilot, {
      adminUserId: admin.id,
      status: 'PENDING',
      page: 1,
    });

    expect(result.items.map((item) => item.email)).toEqual(['asha@example.in', 'brand@example.in']);
  });

  it('the retention job deletes requests older than 180 days', async () => {
    await requestAccess(pilot, asha, requestFrom());
    await db.accessRequest.updateMany({
      data: { createdAt: new Date(ctx.clock.now().getTime() - 181 * DAY_MS) },
    });
    await requestAccess(pilot, { ...asha, email: 'recent@example.in' }, requestFrom());

    const counts = await purgeExpiredSecurityData(ctx);

    expect(counts.accessRequests).toBe(1);
    expect((await db.accessRequest.findMany()).map((row) => row.email)).toEqual([
      'recent@example.in',
    ]);
  });
});
