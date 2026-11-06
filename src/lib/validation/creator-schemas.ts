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
  platform: z.enum(['YOUTUBE', 'INSTAGRAM'], 'validation.invalidChoice'),
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

const upper = (value: string) => value.trim().toUpperCase();

/**
 * ADR-013: payout account details, passed straight to the payment gateway (never stored).
 * Formats: PAN AAAAA9999A, IFSC AAAA0XXXXXX, Indian mobile numbers, 9–18 digit accounts.
 */
export const payoutDetailsSchema = z
  .object({
    legalName: z.string().trim().min(2, 'validation.required').max(100, 'validation.tooLong'),
    pan: z
      .string()
      .transform(upper)
      .refine((value) => /^[A-Z]{5}\d{4}[A-Z]$/.test(value), 'payout.invalidPan'),
    phone: z
      .string()
      .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
      .refine((value) => /^[6-9]\d{9}$/.test(value), 'payout.invalidPhone'),
    accountHolderName: z
      .string()
      .trim()
      .min(2, 'validation.required')
      .max(100, 'validation.tooLong'),
    accountNumber: z
      .string()
      .trim()
      .refine((value) => /^\d{9,18}$/.test(value), 'payout.invalidAccountNumber'),
    confirmAccountNumber: z.string().trim(),
    ifsc: z
      .string()
      .transform(upper)
      .refine((value) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value), 'payout.invalidIfsc'),
  })
  .refine((fields) => fields.accountNumber === fields.confirmAccountNumber, {
    message: 'payout.accountNumbersDiffer',
    path: ['confirmAccountNumber'],
  });
