import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { RequestStatusBadge, RequestTerms } from '@/components/requests/RequestDisplay';
import {
  BlockToggleForm,
  EditRequestForm,
  WithdrawRequestButton,
} from '@/components/requests/RequestForms';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getRequest, getRequestFormContext } from '@/services/requests';
import { setCreatorBlockedAction } from '../actions';

const PAISE_PER_RUPEE = 100;

/** UC-R1 / UC-R2: a request the brand sent; editable and withdrawable while open. */
export default async function BrandRequestPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('requests.detail');
  const format = await getFormatter();
  const container = getContainer();

  let request;
  try {
    request = await getRequest(container, { userId: session.user.id, requestId: id });
  } catch (error) {
    // SEC-2: another brand's request looks like it doesn't exist.
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'NOT_ALLOWED')) {
      notFound();
    }
    throw error;
  }
  const formContext = request.canEdit
    ? await getRequestFormContext(container, session.user.id)
    : null;

  return (
    <PageShell
      title={request.campaignName}
      intro={
        <span className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge status={request.status} />
          {t('sentTo', { name: request.creatorDisplayName })}
          <Link href={`/brand/creators/${request.creatorSlug}`} className="underline">
            {t('viewProfile')}
          </Link>
        </span>
      }
    >
      {request.status === 'OPEN' ? (
        <p className="text-muted-foreground text-sm">
          {t('expires', { date: format.dateTime(request.expiresAt, { dateStyle: 'medium' }) })}
        </p>
      ) : null}
      {request.status === 'DECLINED' && request.declineReason ? (
        <p className="text-sm">{t('declinedBecause', { reason: request.declineReason })}</p>
      ) : null}
      {request.chatId ? (
        <Button asChild className="w-fit">
          <Link href={`/messages/${request.chatId}`}>{t('openChat')}</Link>
        </Button>
      ) : null}
      <RequestTerms request={request} locale={locale} countryCode={session.user.countryCode} />
      {request.canEdit && formContext ? (
        <Card className="grid gap-4">
          <CardTitle>{t('editTitle')}</CardTitle>
          <EditRequestForm
            requestId={request.id}
            campaignNames={formContext.campaignNames}
            minDeadline={formContext.minDeadline}
            draft={{
              campaignName: request.campaignName,
              brief: request.brief,
              deliverables: request.deliverables,
              budgetRupees:
                request.budgetMinor === null ? null : request.budgetMinor / PAISE_PER_RUPEE,
              deadline: request.deadline.toISOString().slice(0, 10),
              usageRights: request.usageRights,
            }}
          />
          <WithdrawRequestButton requestId={request.id} />
        </Card>
      ) : null}
      <Card>
        <BlockToggleForm
          action={setCreatorBlockedAction}
          requestId={request.id}
          isBlocked={request.isBlockedByViewer}
          otherPartyName={request.creatorDisplayName}
        />
      </Card>
    </PageShell>
  );
}
