'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t('unexpectedTitle')}</h1>
      <p className="text-muted-foreground mt-3" role="alert">
        {t('INTERNAL')}
      </p>
      <Button className="mt-6" onClick={reset}>
        {t('tryAgain')}
      </Button>
    </main>
  );
}
