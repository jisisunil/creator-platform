import type { Metadata, Viewport } from 'next';
import {
  Instrument_Serif,
  Inter,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
} from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CLIENT_MESSAGE_NAMESPACES, pickMessages } from '@/i18n/client-messages';
import { routing } from '@/i18n/routing';
import '../globals.css';

// Downloaded at build time and served from our own domain (CSP font-src 'self'; no request
// to Google from visitors). Devanagari faces carry a unicode-range, so browsers fetch them
// only for Hindi text. `swap` shows text at once in a fallback font (NFR-1, NFR-6).
//
// Only the headline serif is preloaded (15 KB): on a slow phone, preloading every font held
// back the stylesheet and pushed the first paint past 2 s. Inter and the italic swap in a
// moment later, over metric-matched fallbacks.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: false,
});
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument-serif',
});
// The accent phrase in headlines (.display-accent).
const instrumentSerifItalic = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  display: 'swap',
  variable: '--font-instrument-serif-italic',
  preload: false,
});
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  display: 'swap',
  variable: '--font-noto-sans-devanagari',
  preload: false,
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: '400',
  display: 'swap',
  variable: '--font-noto-serif-devanagari',
  preload: false,
});
const fontVariables = [
  inter,
  instrumentSerif,
  instrumentSerifItalic,
  notoSansDevanagari,
  notoSerifDevanagari,
]
  .map((font) => font.variable)
  .join(' ');

// The CSP nonce (src/proxy.ts) is per request, so pages must render per request too;
// statically rendered pages would have their scripts blocked.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    icons: { apple: '/icons/apple-touch-icon.png' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fdfcf9',
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'common' });
  // Only what client components need goes to the browser (src/i18n/client-messages.ts).
  const clientMessages = pickMessages(await getMessages({ locale }), CLIENT_MESSAGE_NAMESPACES);

  return (
    <html lang={locale} className={fontVariables}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:p-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider messages={clientMessages}>
          <SiteHeader />
          {children}
          <SiteFooter />
          <ServiceWorkerRegistration />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
