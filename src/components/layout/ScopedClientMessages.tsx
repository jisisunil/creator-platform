import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CLIENT_MESSAGE_NAMESPACES, pickMessages } from '@/i18n/client-messages';

/**
 * NFR-1: sends a section's form texts to the browser on that section's pages only, not with
 * every page. A nested provider replaces the parent's messages, so it carries the shared
 * ones too.
 */
export async function ScopedClientMessages({
  locale,
  namespaces,
  children,
}: {
  locale: string;
  namespaces: readonly string[];
  children: ReactNode;
}) {
  const messages = pickMessages(await getMessages({ locale }), [
    ...CLIENT_MESSAGE_NAMESPACES,
    ...namespaces,
  ]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
