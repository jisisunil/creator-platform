import type { ReactNode } from 'react';
import { ScopedClientMessages } from '@/components/layout/ScopedClientMessages';
import { PAYOUT_PAGE_MESSAGE_NAMESPACES } from '@/i18n/client-messages';

/** NFR-1: the payout form's texts go to the browser only on this page. */
export default async function PayoutsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <ScopedClientMessages locale={locale} namespaces={PAYOUT_PAGE_MESSAGE_NAMESPACES}>
      {children}
    </ScopedClientMessages>
  );
}
