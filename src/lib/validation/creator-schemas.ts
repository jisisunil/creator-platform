import { z } from 'zod';
import { PROFILE_LIMITS, SELF_REPORTED_MAX_FOLLOWERS } from '@/config/creators';

/**
 * Creator and social-account form schemas, shared by the browser and server actions.
 * Messages are i18n keys under `fieldErrors`.
 */

/** A checkbox group: missing → [], one value → [value], several → array. */
const checkboxGroup = z.preprocess(
  (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
  z.array(z.string().max(40)),
);

/** FR-2.1 / UC-C1 profile details. */
export const profileDetailsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(PROFILE_LIMITS.displayNameMax, 'validation.tooLong'),
  bio: z.string().trim().max(PROFILE_LIMITS.bioMax, 'validation.tooLong'),
  stateCode: z.string().min(1, 'validation.invalidChoice').max(4),
  city: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(PROFILE_LIMITS.cityMax, 'validation.tooLong'),
  languageCodes: checkboxGroup
    .refine((codes) => codes.length >= PROFILE_LIMITS.minLanguages, 'profile.tooFewLanguages')
    .refine((codes) => codes.length <= PROFILE_LIMITS.maxLanguages, 'profile.tooManyLanguages'),
  categorySlugs: checkboxGroup
    .refine((slugs) => slugs.length >= PROFILE_LIMITS.minCategories, 'profile.tooFewCategories')
    .refine((slugs) => slugs.length <= PROFILE_LIMITS.maxCategories, 'profile.tooManyCategories'),
});

/** An optional whole-rupee price; blank means "don't show". */
const optionalRupees = z
  .string()
  .trim()
  .regex(/^\d*$/, 'profile.invalidAmount')
  .transform((value) => (value === '' ? null : Number(value)))
  .refine(
    (value) => value === null || value <= PROFILE_LIMITS.maxRateRupees,
    'profile.invalidAmount',
  );

/** UC-C6 rate card. */
export const rateCardSchema = z.object({
  REEL: optionalRupees,
  STORY: optionalRupees,
  VIDEO: optionalRupees,
  POST: optionalRupees,
});

const httpsUrl = z
  .string()
  .trim()
  .max(PROFILE_LIMITS.urlMax, 'validation.tooLong')
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      // Not a URL at all.
      return false;
    }
  }, 'profile.invalidUrl');

/** FR-2.2 portfolio item. */
export const portfolioItemSchema = z.object({
  brandName: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(PROFILE_LIMITS.portfolioBrandMax, 'validation.tooLong'),
  url: httpsUrl,
  collaboratedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.required')
    .transform((value) => new Date(`${value}T00:00:00Z`)),
});

/** UC-C6 availability. */
export const availabilitySchema = z.object({
  isOpen: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

/** FR-3.1 YouTube link by URL or id. */
export const channelLinkSchema = z.object({
  channelUrlOrId: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
});

/**
 * Q-43 self-reported Instagram: the handle (or profile link) and an optional declared
 * follower count. The service checks the handle's format and the range.
 */
export const selfReportedAccountSchema = z.object({
  handle: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
  declaredFollowers: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.coerce
      .number('validation.outOfRange')
      .int('validation.outOfRange')
      .min(0, 'validation.outOfRange')
      .max(SELF_REPORTED_MAX_FOLLOWERS, 'validation.outOfRange')
      .nullable(),
  ),
});

/** UC-C2 channel choice. */
export const chooseAccountSchema = z.object({
  pendingId: z.string().min(1).max(64),
  externalId: z.string().min(1).max(128),
});

/** UC-M2: a creator's appeal against a "suspicious" authenticity decision. */
export const appealFlagSchema = z.object({
  flagId: z.string().min(1).max(64),
  appealText: z.string().trim().min(20, 'profile.appealTooShort').max(1000, 'validation.tooLong'),
});
