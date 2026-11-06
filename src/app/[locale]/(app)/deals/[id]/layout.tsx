import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import {
  CLIENT_MESSAGE_NAMESPACES,
  DEAL_PAGE_MESSAGE_NAMESPACES,
  pickMessages,
} from '@/i18n/client-messages';

/**
 * NFR-1: the deal forms' texts go to the browser only on deal pages, not with every page.
 * A nested provider replaces the parent's messages, so it carries the shared ones too.
 */
export default async function DealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = pickMessages(await getMessages({ locale }), [
    ...CLIENT_MESSAGE_NAMESPACES,
    ...DEAL_PAGE_MESSAGE_NAMESPACES,
  ]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
