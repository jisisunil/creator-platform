import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('errors');
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t('pageNotFoundTitle')}</h1>
      <p className="text-muted-foreground mt-3">{t('pageNotFoundText')}</p>
      <Button asChild className="mt-6">
        <Link href="/">{t('goHome')}</Link>
      </Button>
    </main>
  );
}
