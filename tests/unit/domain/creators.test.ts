import { describe, expect, it } from 'vitest';
import { containsProfanity, findContactDetails } from '@/domain/content-safety';
import {
  engagementRateBp,
  missingProfileFields,
  profileCompletenessPercent,
  slugBaseFrom,
  tierForFollowers,
} from '@/domain/creators';
import { buildCreatorProfileText } from '@/domain/profile-text';

describe('tierForFollowers (FR-4.4)', () => {
  it('uses the spec boundaries', () => {
    expect(tierForFollowers(9_999)).toBe('NANO');
    expect(tierForFollowers(10_000)).toBe('MICRO');
    expect(tierForFollowers(99_999)).toBe('MICRO');
    expect(tierForFollowers(100_000)).toBe('MID');
    expect(tierForFollowers(500_000)).toBe('MACRO');
    expect(tierForFollowers(1_000_000)).toBe('MEGA');
  });
});

describe('engagementRateBp', () => {
  it('is interactions per post as basis points of followers', () => {
    expect(engagementRateBp({ followers: 10_000, posts: 10, likes: 2_000, comments: 500 })).toBe(
      250,
    );
  });

  it('is zero without posts or followers', () => {
    expect(engagementRateBp({ followers: 0, posts: 3, likes: 10, comments: 1 })).toBe(0);
    expect(engagementRateBp({ followers: 100, posts: 0, likes: 0, comments: 0 })).toBe(0);
  });
});

describe('profile completeness (FR-4.2)', () => {
  const complete = {
    displayName: 'Asha',
    bio: 'Home-style Tamil recipes and street food walks around Chennai.',
    hasPhoto: true,
    city: 'Chennai',
    stateCode: 'TN',
    languageCount: 2,
    categoryCount: 1,
    rateCardCount: 2,
    portfolioCount: 1,
    connectedAccountCount: 1,
  };

  it('is 100% when every field is filled', () => {
    expect(profileCompletenessPercent(complete)).toBe(100);
    expect(missingProfileFields(complete)).toEqual([]);
  });

  it('lists missing fields in editor order', () => {
    const partial = { ...complete, hasPhoto: false, bio: 'short', portfolioCount: 0 };

    expect(missingProfileFields(partial)).toEqual(['bio', 'photo', 'portfolio']);
    expect(profileCompletenessPercent(partial)).toBe(67);
  });
});

describe('slugBaseFrom', () => {
  it('makes URL-safe slugs and falls back for non-Latin names', () => {
    expect(slugBaseFrom('  Asha’s Kitchen!! ')).toBe('asha-s-kitchen');
    expect(slugBaseFrom('आशा')).toBe('creator');
  });
});

describe('content safety (UC-C1, FR-8.2)', () => {
  it('finds emails, phone numbers and links', () => {
    expect(findContactDetails('mail me at asha@example.in')).toEqual(['EMAIL']);
    expect(findContactDetails('call +91 98765 43210')).toEqual(['PHONE']);
    expect(findContactDetails('whatsapp 9876543210 now')).toEqual(['PHONE']);
    expect(findContactDetails('see www.asha.in/menu')).toEqual(['LINK']);
    expect(findContactDetails('asha at gmail dot com')).toEqual(['EMAIL']);
  });

  it('leaves ordinary bios alone', () => {
    expect(findContactDetails('Food vlogger from Madurai, 5 years, 200 recipes')).toEqual([]);
  });

  it('detects blocked words in English and Hindi as whole words', () => {
    expect(containsProfanity('what the FUCK')).toBe(true);
    expect(containsProfanity('यह चूतिया है')).toBe(true);
    expect(containsProfanity('Scunthorpe cookery')).toBe(false);
  });
});

describe('buildCreatorProfileText (ADR-006)', () => {
  it('builds stable text from public fields only', () => {
    const text = buildCreatorProfileText({
      displayName: 'Asha',
      bio: 'Tamil recipes.',
      city: 'Chennai',
      stateName: 'Tamil Nadu',
      countryCode: 'IN',
      languageNames: ['Tamil', 'English'],
      categoryNames: ['Food'],
      platforms: ['YOUTUBE'],
      tier: 'MICRO',
    });

    expect(text).toBe(
      [
        'Creator: Asha',
        'Location: Chennai, Tamil Nadu, IN',
        'Languages: Tamil, English',
        'Categories: Food',
        'Platforms: YOUTUBE',
        'Tier: micro',
        'About: Tamil recipes.',
      ].join('\n'),
    );
  });
});
