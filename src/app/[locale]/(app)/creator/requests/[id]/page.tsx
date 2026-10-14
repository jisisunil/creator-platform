import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { RequestStatusBadge, RequestTerms } from '@/components/requests/RequestDisplay';
import { BlockToggleForm, RespondToRequestForms } from '@/components/requests/RequestForms';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getRequest } from '@/services/requests';
import { setBrandBlockedAction } from '../actions';

/** FR-7.2 / UC-R2: a request sent to the creator, with accept and decline. */
export default async function CreatorRequestPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const t = await getTranslations('requests.detail');
  const tIndustries = await getTranslations('industries');
  const format = await getFormatter();

  let request;
  try {
    request = await getRequest(getContainer(), { userId: session.user.id, requestId: id });
  } catch (error) {
    // SEC-2: requests sent to someone else look like they don't exist.
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'NOT_ALLOWED')) {
      notFound();
    }
    throw error;
  }

  return (
    <PageShell
      title={request.campaignName}
      intro={
        <span className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status={request.status} />
          {t('from', { name: request.brand.name })}
        </span>
      }
    >
      <Card className="grid gap-1 text-sm">
        <CardTitle>{request.brand.name}</CardTitle>
        <p>{tIndustries(request.brand.industry)}</p>
        {request.brand.website?.startsWith('https://') ? (
          <p>
            {/* A brand-supplied link: https only, never given our referrer or window. */}
            <a
              href={request.brand.website}
              rel="nofollow noopener noreferrer ugc"
              target="_blank"
              className="underline"
            >
              {request.brand.website}
            </a>
          </p>
        ) : null}
      </Card>
      {request.version > 1 && request.status === 'OPEN' ? (
        <Alert>{t('updatedByBrand')}</Alert>
      ) : null}
      {request.chatId ? (
        <Button asChild className="w-fit">
          <Link href={`/messages/${request.chatId}`}>{t('openChat')}</Link>
        </Button>
      ) : null}
      <RequestTerms request={request} locale={locale} countryCode={session.user.countryCode} />
      {request.canRespond ? (
        <Card className="grid gap-4">
          <CardTitle>{t('respondTitle')}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t('expires', { date: format.dateTime(request.expiresAt, { dateStyle: 'medium' }) })}
          </p>
          <RespondToRequestForms requestId={request.id} version={request.version} />
        </Card>
      ) : null}
      <Card>
        <BlockToggleForm
          action={setBrandBlockedAction}
          requestId={request.id}
          isBlocked={request.isBlockedByViewer}
          otherPartyName={request.brand.name}
        />
      </Card>
    </PageShell>
  );
}
