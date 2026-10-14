import { describe, expect, it } from 'vitest';
import { type EmailTemplates, renderEmail } from '@/adapters/email/templates';
import { SUPPORTED_LOCALES } from '@/config/locales';

const SAMPLE_VARIABLES: { [Name in keyof EmailTemplates]: EmailTemplates[Name] } = {
  verifyEmail: { name: 'Asha', link: 'https://app.test/en/verify-email?token=abc' },
  accountAlreadyExists: {
    signInLink: 'https://app.test/en/sign-in',
    resetLink: 'https://app.test/en/forgot-password',
  },
  passwordReset: { name: 'Asha', link: 'https://app.test/en/reset-password?token=abc' },
  passwordChanged: { name: 'Asha' },
  confirmEmailChange: { name: 'Asha', link: 'https://app.test/en/change-email/confirm?token=a' },
  emailChangeRequested: { name: 'Asha', newEmail: 'n***@example.in' },
  newDeviceSignIn: { name: 'Asha', device: 'Firefox', time: '2026-10-09T10:00:00Z' },
  teamInvite: { brandName: 'Spice Co', inviterName: 'Ravi', link: 'https://app.test/en/invite/x' },
  socialRefreshFailed: {
    name: 'Asha',
    platform: 'YouTube',
    link: 'https://app.test/en/creator/accounts',
  },
  requestReceived: {
    name: 'Asha',
    brandName: 'Spice Co',
    campaignName: 'Diwali',
    link: 'https://app.test/en/creator/requests/r1',
  },
  requestAccepted: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/brand/requests/r1',
  },
  requestDeclined: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/brand/requests/r1',
  },
  dealCancelled: {
    name: 'Ravi',
    otherPartyName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  paymentMarked: {
    name: 'Asha',
    brandName: 'Spice Co',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  dealDeadlinePassed: {
    name: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  newMessage: {
    name: 'Ravi',
    senderName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/messages/t1',
  },
  dealTermsUpdated: {
    name: 'Asha',
    brandName: 'Spice Co',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  dealContentSubmitted: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  dealPostAdded: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  paymentDisputed: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  trialEnding: { name: 'Ravi', brandName: 'Spice Co', link: 'https://app.test/en/brand/plan' },
  trialEnded: { name: 'Ravi', brandName: 'Spice Co', link: 'https://app.test/en/brand/plan' },
  ratingRequested: {
    name: 'Asha',
    otherPartyName: 'Spice Co',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
  paymentOverdue: {
    name: 'Ravi',
    creatorName: 'Asha',
    campaignName: 'Diwali',
    link: 'https://app.test/en/deals/d1',
  },
};

describe('email templates (NFR-7)', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [template, variables] of Object.entries(SAMPLE_VARIABLES)) {
      it(`renders ${template} in ${locale} with every variable filled in`, () => {
        const email = renderEmail(template as keyof EmailTemplates, locale, variables as never);

        expect(email.subject.length).toBeGreaterThan(0);
        expect(email.text).not.toMatch(/\{\w+\}/);
        expect(email.html).toContain(`lang="${locale}"`);
      });
    }
  }

  it('escapes HTML in variables so names cannot inject markup', () => {
    const email = renderEmail('passwordChanged', 'en', { name: '<script>alert(1)</script>' });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('adds a button with the link for link templates', () => {
    const email = renderEmail('verifyEmail', 'en', SAMPLE_VARIABLES.verifyEmail);

    expect(email.html).toContain('href="https://app.test/en/verify-email?token=abc"');
    expect(email.text).toContain('https://app.test/en/verify-email?token=abc');
  });

  it('falls back to English for an unsupported locale', () => {
    const email = renderEmail('passwordChanged', 'fr', { name: 'Asha' });

    expect(email.html).toContain('lang="en"');
  });
});
