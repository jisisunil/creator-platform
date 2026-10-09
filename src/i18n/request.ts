import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { FALLBACK_DISPLAY_TIMEZONE } from '@/config/locales';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`./${locale}.json`)) as { default: Record<string, unknown> };
  return {
    locale,
    messages: messages.default,
    timeZone: FALLBACK_DISPLAY_TIMEZONE,
  };
});
