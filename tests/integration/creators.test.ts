import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addPortfolioItem,
  getOwnProfile,
  getPublicProfile,
  removePortfolioItem,
  setAvailability,
  updateProfileDetails,
  updateRateCard,
  uploadProfilePhoto,
} from '@/services/creators';
import { createVerifiedUser } from './accounts/fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, resetDatabase, type TestContext } from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

const details = {
  displayName: 'Asha Cooks',
  bio: 'Home-style Tamil recipes and street food walks around Chennai.',
  city: 'Chennai',
  stateCode: 'TN',
  languageCodes: ['ta', 'en'],
  categorySlugs: ['food'],
};

// A large phone-style photo carrying EXIF metadata, made once for all tests.
let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: '#c05621' },
  })
    .withExif({ IFD0: { Artist: 'Asha', ImageDescription: 'Home, Chennai' } })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

async function creator(email = 'asha@example.in') {
  const user = await createVerifiedUser(ctx, db, { email });
  const profile = await getOwnProfile(ctx, user);
  return { user, profile };
}

describe('creator profile (FR-2, UC-C1, UC-C6)', () => {
  it('UC-C1 saves details, languages and categories', async () => {
    const { user } = await creator();

    await updateProfileDetails(ctx, user.id, details);

    const profile = await getOwnProfile(ctx, user);
    expect(profile).toMatchObject({ displayName: 'Asha Cooks', city: 'Chennai', stateCode: 'TN' });
    expect([...profile.languageCodes].sort()).toEqual(['en', 'ta']);
    expect(profile.categorySlugs).toEqual(['food']);
  });

  it('UC-C1 blocks contact details and profanity in the bio', async () => {
    const { user } = await creator();

    await expect(
      updateProfileDetails(ctx, user.id, { ...details, bio: 'WhatsApp me on 9876543210' }),
    ).rejects.toMatchObject({ fieldErrors: { bio: 'profile.noContactDetails' } });
    await expect(
      updateProfileDetails(ctx, user.id, { ...details, bio: 'what the fuck' }),
    ).rejects.toMatchObject({ fieldErrors: { bio: 'profile.noProfanity' } });
  });

  it('UC-C1 rejects unknown states, languages and categories', async () => {
    const { user } = await creator();

    await expect(
      updateProfileDetails(ctx, user.id, { ...details, stateCode: 'XX' }),
    ).rejects.toMatchObject({ fieldErrors: { stateCode: 'validation.invalidChoice' } });
    await expect(
      updateProfileDetails(ctx, user.id, { ...details, categorySlugs: ['not-a-category'] }),
    ).rejects.toMatchObject({ fieldErrors: { categorySlugs: 'validation.invalidChoice' } });
  });

  it('UC-C6 stores prices in paise and toggles availability', async () => {
    const { user } = await creator();

    await updateRateCard(ctx, user.id, [{ deliverable: 'REEL', rupees: 4500 }]);
    await setAvailability(ctx, user.id, false);

    const profile = await getOwnProfile(ctx, user);
    expect(profile.rateCard).toEqual([
      { deliverable: 'REEL', amountMinor: 450_000, currency: 'INR' },
    ]);
    expect(profile.isOpenToCollaborations).toBe(false);
  });

  it('FR-2.2 adds portfolio items; other creators cannot remove them (SR-5)', async () => {
    const { user } = await creator();
    const other = await creator('other@example.in');
    await addPortfolioItem(ctx, user.id, {
      url: 'https://example.in/post',
      brandName: 'Spice Co',
      collaboratedOn: new Date('2026-09-01'),
    });
    const [item] = (await getOwnProfile(ctx, user)).portfolio;

    await expect(removePortfolioItem(ctx, other.user.id, item?.id ?? '')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await removePortfolioItem(ctx, user.id, item?.id ?? '');
    expect((await getOwnProfile(ctx, user)).portfolio).toEqual([]);
  });

  it('SR-9 accepts a real image and rejects a disguised file', async () => {
    const { user } = await creator();

    await uploadProfilePhoto(ctx, user.id, PNG);
    expect((await getOwnProfile(ctx, user)).photoKey).toMatch(/^photos\//);

    const script = Buffer.from('<script>alert(1)</script>');
    await expect(uploadProfilePhoto(ctx, user.id, script)).rejects.toMatchObject({
      fieldErrors: { photo: 'profile.photoType' },
    });
  });

  it('NFR-6 stores a small WebP photo without metadata', async () => {
    const { user } = await creator();

    await uploadProfilePhoto(ctx, user.id, PNG);

    const key = (await getOwnProfile(ctx, user)).photoKey ?? '';
    const stored = await ctx.fileStorage.get(key);
    expect(stored?.contentType).toBe('image/webp');
    const metadata = await sharp(stored?.bytes).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 320, height: 320 });
    expect(metadata.exif).toBeUndefined();
    expect(stored?.bytes.length).toBeLessThan(PNG.length);
  });

  it('SR-9 rejects a file that only looks like an image', async () => {
    const { user } = await creator();
    const pngHeaderOnly = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);

    await expect(uploadProfilePhoto(ctx, user.id, pngHeaderOnly)).rejects.toMatchObject({
      fieldErrors: { photo: 'profile.photoType' },
    });
    expect((await getOwnProfile(ctx, user)).photoKey).toBeNull();
  });

  it('SR-9 rejects files the malware scanner flags', async () => {
    const { user } = await creator();
    const scanned = { ...ctx, malwareScanner: { scan: async () => 'INFECTED' as const } };

    await expect(uploadProfilePhoto(scanned, user.id, PNG)).rejects.toMatchObject({
      fieldErrors: { photo: 'profile.photoRejected' },
    });
  });

  it('brands cannot have a creator profile', async () => {
    const brand = await createVerifiedUser(ctx, db, { email: 'b@spiceco.in', role: 'BRAND' });

    await expect(getOwnProfile(ctx, brand)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('public profile (FR-2.4, UC-D2, SR-12)', () => {
  it('SR-12 never includes contact details or internal ids', async () => {
    const { user, profile } = await creator();
    await updateProfileDetails(ctx, user.id, details);

    const publicProfile = await getPublicProfile(ctx, profile.slug);

    const json = JSON.stringify(publicProfile);
    expect(json).not.toContain('asha@example.in');
    expect(json).not.toContain(user.id);
    expect(publicProfile).toMatchObject({ displayName: 'Asha Cooks', city: 'Chennai' });
  });

  it('UC-D2 shows "unavailable" for suspended creators and unknown slugs', async () => {
    const { user, profile } = await creator();
    await db.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    await expect(getPublicProfile(ctx, profile.slug)).resolves.toBeNull();
    await expect(getPublicProfile(ctx, 'no-such-creator')).resolves.toBeNull();
  });
});
