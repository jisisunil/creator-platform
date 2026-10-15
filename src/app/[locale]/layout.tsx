import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ServiceWorkerRegistration } from '@/components/layout/ServiceWorkerRegistration';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { routing } from '@/i18n/routing';
import '../globals.css';

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
  themeColor: '#3b3fa8',
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

  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:p-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
          <ServiceWorkerRegistration />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
