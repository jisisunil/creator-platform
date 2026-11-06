import type { ReactNode } from 'react';
import { ScopedClientMessages } from '@/components/layout/ScopedClientMessages';
import { DEAL_PAGE_MESSAGE_NAMESPACES } from '@/i18n/client-messages';

/** NFR-1: the deal forms' texts go to the browser only on deal pages. */
export default async function DealLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ScopedClientMessages locale={locale} namespaces={DEAL_PAGE_MESSAGE_NAMESPACES}>
      {children}
    </ScopedClientMessages>
  );
}
