import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/config/auth';
import { BRAND_INDUSTRIES } from '@/config/industries';
import { SELF_SERVICE_ROLES } from '@/domain/accounts';

/**
 * Form schemas shared by the browser (instant field errors) and server actions (the real
 * check). Messages are i18n keys under `fieldErrors`.
 */

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;

const requiredText = (maxLength: number) =>
  z.string().trim().min(1, 'validation.required').max(maxLength, 'validation.tooLong');

const email = z
  .string()
  .trim()
  .min(1, 'validation.required')
  .max(MAX_EMAIL_LENGTH, 'validation.tooLong')
  .pipe(z.email('validation.invalidEmail'));

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'password.tooShort')
  .max(PASSWORD_MAX_LENGTH, 'password.tooLong');

const existingPassword = z
  .string()
  .min(1, 'validation.required')
  .max(PASSWORD_MAX_LENGTH, 'validation.tooLong');

/** A required checkbox: browsers send "on" when ticked and nothing otherwise. */
const requiredCheckbox = (message: string) =>
  z.literal('on', { message }).transform(() => true as const);

const optionalCheckbox = z
  .literal('on')
  .optional()
  .transform((value) => value === 'on');

const captchaToken = z
  .string()
  .optional()
  .transform((value) => value || null);

/** Fields every sign-up path shares: role, 18+, privacy notice, marketing, brand details. */
const signUpChoices = z.object({
  role: z.enum(SELF_SERVICE_ROLES, { message: 'validation.invalidChoice' }),
  isAdult: requiredCheckbox('validation.under18'),
  acceptsPrivacyNotice: requiredCheckbox('validation.mustAccept'),
  acceptsMarketing: optionalCheckbox,
  brandName: z.string().trim().max(MAX_NAME_LENGTH, 'validation.tooLong').optional(),
  industry: z
    .enum(BRAND_INDUSTRIES, { message: 'validation.invalidChoice' })
    .optional()
    .or(z.literal('')),
});

function requireBrandDetails<T extends z.infer<typeof signUpChoices>>(
  value: T,
  context: z.RefinementCtx,
): void {
  if (value.role !== 'BRAND') return;
  if (!value.brandName) {
    context.addIssue({ code: 'custom', path: ['brandName'], message: 'validation.required' });
  }
  if (!value.industry) {
    context.addIssue({ code: 'custom', path: ['industry'], message: 'validation.invalidChoice' });
  }
}

/** UC-A1 email sign-up. */
export const signUpSchema = signUpChoices
  .extend({
    name: requiredText(MAX_NAME_LENGTH),
    email,
    password: newPassword,
    captchaToken,
  })
  .superRefine(requireBrandDetails);

/** UC-A1 Google sign-up: the same choices, before going to Google. */
export const googleSignUpSchema = signUpChoices.superRefine(requireBrandDetails);

/** UC-A2 sign-in. */
export const signInSchema = z.object({ email, password: existingPassword, captchaToken });

/** UC-A2: linking Google to an existing password account. */
export const linkGoogleSchema = z.object({ password: existingPassword, captchaToken });

/** Forgot password, resend verification. */
export const emailOnlySchema = z.object({ email });

/** UC-A3 reset password. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'validation.required'),
  newPassword,
});

/** FR-1.3 change password. Google-only accounts leave the current password empty. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH, 'validation.tooLong'),
  newPassword,
});

/** UC-A4 change email. */
export const changeEmailSchema = z.object({
  newEmail: email,
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH, 'validation.tooLong'),
});

/** SR-4 TOTP code. */
export const twoFactorCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.codeFormat'),
});

/** UC-A6 invite. */
export const inviteMemberSchema = z.object({ email });

/** UC-A6 accepting an invite with a new account. */
export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'validation.required'),
  name: requiredText(MAX_NAME_LENGTH),
  password: newPassword,
  isAdult: requiredCheckbox('validation.under18'),
  acceptsPrivacyNotice: requiredCheckbox('validation.mustAccept'),
  acceptsMarketing: optionalCheckbox,
});

/** PRV-5 marketing toggle. */
export const marketingConsentSchema = z.object({
  isGranted: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

/** UC-A6 team management actions that target one record. */
export const targetIdSchema = z.object({ id: z.string().min(1).max(64) });

/** PRV-3: what should be corrected (for fields the user can't edit). */
export const correctionRequestSchema = z.object({
  details: z.string().trim().min(10, 'privacy.detailsTooShort').max(2000, 'validation.tooLong'),
});

/** PRV-4: the user types their email address to confirm deleting the account. */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1, 'privacy.confirmEmail').max(320),
});
