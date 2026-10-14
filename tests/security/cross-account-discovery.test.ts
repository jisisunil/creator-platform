import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToShortlist,
  createShortlist,
  deleteShortlist,
  exportShortlistCsv,
  getShortlist,
  setShortlistNote,
} from '@/services/shortlists';
import { createBrandOwner, createSearchableCreator } from '../integration/discovery-fixtures';
import { createTestDatabaseClient } from '../integration/test-database';
import { createTestContext, resetDatabase, type TestContext } from '../integration/test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

describe('shortlists across brands (SR-5, SEC-2)', () => {
  it('SEC-2 another brand changing the id in the URL gets "not found", and it is logged', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const intruder = await createBrandOwner(ctx, db, 'intruder@other.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const shortlistId = await createShortlist(ctx, { userId: owner.id, name: 'Private plans' });
    await addToShortlist(ctx, { userId: owner.id, shortlistId, creatorId });
    const [entry] = (await getShortlist(ctx, { userId: owner.id, shortlistId })).entries;

    // Functions, so each attempt starts only when awaited (no unhandled rejections).
    const attempts = [
      () => getShortlist(ctx, { userId: intruder.id, shortlistId }),
      () => addToShortlist(ctx, { userId: intruder.id, shortlistId, creatorId }),
      () =>
        setShortlistNote(ctx, {
          userId: intruder.id,
          shortlistId,
          itemId: entry?.itemId ?? '',
          note: 'x',
        }),
      () => deleteShortlist(ctx, { userId: intruder.id, shortlistId }),
      () =>
        exportShortlistCsv(ctx, {
          userId: intruder.id,
          shortlistId,
          labels: { headers: [], yes: 'y', no: 'n' },
        }),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }

    expect(await db.shortlist.count()).toBe(1);
    expect(
      await db.auditEvent.count({ where: { action: 'access.denied', actorUserId: intruder.id } }),
    ).toBe(5);
  });

  it('SR-5 creators cannot use shortlists at all', async () => {
    await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const creatorUser = await db.user.findUniqueOrThrow({ where: { email: 'c@example.in' } });

    await expect(createShortlist(ctx, { userId: creatorUser.id, name: 'x' })).rejects.toMatchObject(
      {
        code: 'NOT_ALLOWED',
      },
    );
  });
});
