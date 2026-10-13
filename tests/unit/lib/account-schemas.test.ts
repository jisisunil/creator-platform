import { describe, expect, it } from 'vitest';
import { signUpSchema, twoFactorCodeSchema } from '@/lib/validation/account-schemas';
import { fieldErrorsFrom } from '@/lib/validation/form-data';

const validCreator = {
  role: 'CREATOR',
  name: 'Asha',
  email: 'asha@example.in',
  password: 'a-long-password',
  isAdult: 'on',
  acceptsPrivacyNotice: 'on',
};

function errorsFor(input: Record<string, string>) {
  const result = signUpSchema.safeParse(input);
  return result.success ? {} : fieldErrorsFrom(result.error);
}

describe('sign-up schema (UC-A1, PR-2)', () => {
  it('accepts a complete creator sign-up and defaults marketing to off', () => {
    const result = signUpSchema.parse(validCreator);

    expect(result).toMatchObject({ role: 'CREATOR', isAdult: true, acceptsMarketing: false });
  });

  it('UC-A1 blocks under-18 sign-ups when the 18+ box is not ticked', () => {
    const { isAdult: _isAdult, ...withoutAge } = validCreator;

    expect(errorsFor(withoutAge)).toEqual({ isAdult: 'validation.under18' });
  });

  it('PRV-1 requires the privacy notice box', () => {
    const { acceptsPrivacyNotice: _consent, ...withoutConsent } = validCreator;

    expect(errorsFor(withoutConsent)).toEqual({ acceptsPrivacyNotice: 'validation.mustAccept' });
  });

  it('requires brand name and industry for brands', () => {
    expect(errorsFor({ ...validCreator, role: 'BRAND' })).toEqual({
      brandName: 'validation.required',
      industry: 'validation.invalidChoice',
    });
  });

  it('never lets anyone sign up as an admin', () => {
    expect(errorsFor({ ...validCreator, role: 'ADMIN' })).toEqual({
      role: 'validation.invalidChoice',
    });
  });

  it('SR-1 enforces the minimum password length', () => {
    expect(errorsFor({ ...validCreator, password: 'short' })).toEqual({
      password: 'password.tooShort',
    });
  });
});

describe('two-factor code schema (SR-4)', () => {
  it('accepts exactly six digits', () => {
    expect(twoFactorCodeSchema.safeParse({ code: ' 123456 ' }).success).toBe(true);
    expect(twoFactorCodeSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(twoFactorCodeSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });
});
