import { type AbstractIntlMessages, createTranslator } from 'next-intl';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from '@/config/locales';
import en from '@/i18n/en.json';
import hi from '@/i18n/hi.json';

/** Every email the platform sends, with the variables each one needs. */
export interface EmailTemplates {
  verifyEmail: { name: string; link: string };
  accountAlreadyExists: { signInLink: string; resetLink: string };
  passwordReset: { name: string; link: string };
  passwordChanged: { name: string };
  confirmEmailChange: { name: string; link: string };
  emailChangeRequested: { name: string; newEmail: string };
  newDeviceSignIn: { name: string; device: string; time: string };
  teamInvite: { brandName: string; inviterName: string; link: string };
  socialRefreshFailed: { name: string; platform: string; link: string };
}

export type EmailTemplateName = keyof EmailTemplates;

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

// Button text for the templates that carry a link.
const ACTION_KEYS = {
  verifyEmail: 'verifyEmail.action',
  passwordReset: 'passwordReset.action',
  confirmEmailChange: 'confirmEmailChange.action',
  teamInvite: 'teamInvite.action',
  socialRefreshFailed: 'socialRefreshFailed.action',
} as const satisfies Partial<Record<EmailTemplateName, string>>;

const MESSAGES = { en, hi } as const satisfies Record<SupportedLocale, unknown>;

function asSupportedLocale(locale: string): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as SupportedLocale)
    : DEFAULT_LOCALE;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Renders an email in the recipient's language from the `emails` namespace of the
 * translation files. Variables are HTML-escaped; the only link is the template's own.
 */
export function renderEmail<Name extends EmailTemplateName>(
  template: Name,
  locale: string,
  variables: EmailTemplates[Name],
): RenderedEmail {
  const supportedLocale = asSupportedLocale(locale);
  const typedTranslator = createTranslator({
    locale: supportedLocale,
    // Untyped on purpose: keys are built from the template name. A unit test renders
    // every template in every locale, so a missing key fails the build instead.
    messages: MESSAGES[supportedLocale] as AbstractIntlMessages,
    namespace: 'emails',
  });
  // With untyped messages next-intl can't infer placeholder arguments, so state the shape.
  const t = typedTranslator as unknown as (key: string, values?: Record<string, string>) => string;
  const values = variables as unknown as Record<string, string>;
  const subject = t(`${template}.subject`, values);
  const body = t(`${template}.body`, values);
  const footer = t('footer');
  const link = 'link' in values ? values.link : undefined;
  const actionKey =
    template in ACTION_KEYS ? ACTION_KEYS[template as keyof typeof ACTION_KEYS] : undefined;

  const text = [body, link, '', footer].filter((line) => line !== undefined).join('\n\n');
  const paragraphs = body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  const button =
    link && actionKey
      ? `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#3b3fa8;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(t(actionKey))}</a></p><p style="font-size:12px;color:#555">${escapeHtml(link)}</p>`
      : '';
  const html = `<!doctype html><html lang="${supportedLocale}"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2330">${paragraphs}${button}<hr><p style="font-size:12px;color:#555">${escapeHtml(footer)}</p></body></html>`;

  return { subject, text, html };
}
