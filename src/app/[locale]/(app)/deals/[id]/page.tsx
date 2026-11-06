import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import {
  DealHistory,
  DealPosts,
  DealProgress,
  DealStatusBadge,
  DealSubmissions,
} from '@/components/deals/DealDisplay';
import {
  AcceptContractForm,
  CancelDealForm,
  ConfirmPaymentForms,
  ContractForm,
  DisputeForm,
  MarkPaidForm,
  PostLinkForm,
  ReviewWorkForms,
  SubmitWorkForm,
} from '@/components/deals/DealForms';
import { PageShell } from '@/components/layout/PageShell';
import { RatingDetails } from '@/components/ratings/RatingDisplay';
import { RatingForm, ReportRatingForm } from '@/components/ratings/RatingForms';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { RATING_CRITERIA } from '@/domain/ratings';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { formatMoney } from '@/lib/format';
import { type DealView, getDeal, getDealContract } from '@/services/deals';
import { getDealRatings } from '@/services/ratings';

const PAISE_PER_RUPEE = 100;

/**
 * FR-9 / UC-R4 to UC-R6 / ADR-012: one deal: its contract, proof of work and review,
 * payment, posts, history and the viewer's next steps.
 */
export default async function DealPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND', 'CREATOR'] });
  const t = await getTranslations('deals');
  const format = await getFormatter();
  const tTerms = await getTranslations('requests.terms');
  const tDeliverables = await getTranslations('deliverables');
  const tRights = await getTranslations('requests.usageRights');
  const container = getContainer();

  let deal: DealView;
  try {
    deal = await getDeal(container, { userId: session.user.id, dealId: id });
  } catch (error) {
    // SEC-2: someone else's deal looks like it doesn't exist.
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const { contract } = await getDealContract(container, { userId: session.user.id, dealId: id });
  const ratings = await getDealRatings(container, { userId: session.user.id, dealId: id });
  const tRatings = await getTranslations('ratings');
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, deal.currencyCode, locale, session.user.countryCode);
  const can = (action: DealView['allowedActions'][number]) => deal.allowedActions.includes(action);
  const requestPath =
    deal.viewerSide === 'BRAND'
      ? `/brand/requests/${deal.requestId}`
      : `/creator/requests/${deal.requestId}`;
  const isUnderReview = deal.status === 'CONTENT_SUBMITTED';
  const hasPaymentStep = can('MARK_PAID') || can('CONFIRM_RECEIVED');

  return (
    <PageShell
      title={deal.campaignName}
      intro={
        <span className="flex flex-wrap items-center gap-2">
          <DealStatusBadge status={deal.status} />
          {t('with', { name: deal.otherPartyName })}
        </span>
      }
    >
      <div className="flex flex-wrap gap-3">
        {deal.chatId ? (
          <Button asChild>
            <Link href={`/messages/${deal.chatId}`}>{t('openChat')}</Link>
          </Button>
        ) : null}
        {deal.contract.state === 'NONE' ? null : (
          <Button asChild variant="outline">
            <Link href={`/deals/${deal.id}/contract`}>{t('contract.view')}</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/deals/${deal.id}/summary`}>{t('summaryLink')}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={requestPath}>{t('requestLink')}</Link>
        </Button>
      </div>

      {deal.status === 'CANCELLED' ? (
        <Alert>
          {t('cancelledBy', {
            side: deal.cancelledBySide ?? 'BRAND',
            reason: deal.cancelReason ?? '',
          })}
        </Alert>
      ) : (
        <DealProgress status={deal.status} />
      )}

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('contract.title')}</CardTitle>
          <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
            {t(`contract.states.${deal.contract.state}`)}
            {deal.contract.version
              ? ` · ${t('contract.version', { version: deal.contract.version })}`
              : ''}
          </span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">{t('terms.amount')}</dt>
            <dd>
              {deal.agreedAmountMinor === null
                ? t('terms.notAgreed')
                : money(deal.agreedAmountMinor)}
            </dd>
          </div>
          {deal.payment && deal.advancePercent ? (
            <div>
              <dt className="font-medium">{t('terms.split')}</dt>
              <dd>
                {t('terms.splitValue', {
                  percent: deal.advancePercent,
                  advance: money(deal.payment.advanceMinor),
                  balance: money(deal.payment.balanceMinor),
                })}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium">{t('terms.contentDeadline')}</dt>
            <dd>{format.dateTime(deal.deadline, { dateStyle: 'medium', timeZone: 'UTC' })}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('terms.paymentDue')}</dt>
            <dd>
              {deal.paymentDueAt
                ? format.dateTime(deal.paymentDueAt, { dateStyle: 'medium' })
                : t('terms.dueAfterApproval')}
            </dd>
          </div>
        </dl>
        <p className="text-muted-foreground text-sm">
          {t(`contract.explain.${deal.viewerSide}.${deal.contract.state}`)}
        </p>
        {can('ACCEPT_CONTRACT') && deal.contract.fingerprint ? (
          <div className="grid gap-3">
            <Button asChild variant="outline" className="w-fit">
              <Link href={`/deals/${deal.id}/contract`}>{t('contract.readFirst')}</Link>
            </Button>
            <AcceptContractForm dealId={deal.id} fingerprint={deal.contract.fingerprint} />
          </div>
        ) : null}
        {can('ISSUE_CONTRACT') ? (
          <details className="group" open={deal.contract.state === 'NONE'}>
            <summary className="cursor-pointer text-sm font-medium">
              {deal.contract.state === 'NONE' ? t('contract.prepare') : t('contract.revise')}
            </summary>
            <div className="mt-4">
              <ContractForm
                dealId={deal.id}
                amountRupees={
                  deal.agreedAmountMinor === null ? null : deal.agreedAmountMinor / PAISE_PER_RUPEE
                }
                advancePercent={deal.advancePercent}
                paymentDueOn={deal.paymentDueOn?.toISOString().slice(0, 10) ?? null}
                additionalTerms={contract?.additionalTerms ?? null}
                hasUploadedFile={contract?.source === 'UPLOADED'}
              />
            </div>
          </details>
        ) : null}
      </Card>

      <Card className="grid gap-4">
        <CardTitle>{t('work.title')}</CardTitle>
        {isUnderReview && deal.reviewDueAt ? (
          <Alert>
            {t(`work.reviewBy.${deal.viewerSide}`, {
              date: format.dateTime(deal.reviewDueAt, { dateStyle: 'medium' }),
            })}
          </Alert>
        ) : null}
        <DealSubmissions submissions={deal.submissions} />
        {can('SUBMIT_WORK') ? <SubmitWorkForm dealId={deal.id} /> : null}
        {deal.viewerSide === 'CREATOR' &&
        (deal.status === 'ACCEPTED' || deal.status === 'CHANGES_REQUESTED') &&
        !can('SUBMIT_WORK') ? (
          <p className="text-muted-foreground text-sm">{t('work.needsContract')}</p>
        ) : null}
        {deal.viewerSide === 'BRAND' && isUnderReview ? (
          <ReviewWorkForms
            dealId={deal.id}
            canRequestChanges={can('REQUEST_CHANGES')}
            changeRequestsLeft={deal.changeRequestsLeft}
          />
        ) : null}
        {can('RAISE_DISPUTE') ? (
          <details>
            <summary className="cursor-pointer text-sm">{t('work.disputeTitle')}</summary>
            <div className="mt-3">
              <DisputeForm dealId={deal.id} />
            </div>
          </details>
        ) : null}
      </Card>

      {hasPaymentStep ? (
        <Card className="grid gap-6">
          <CardTitle>{t('nextStep')}</CardTitle>
          {can('MARK_PAID') ? <MarkPaidForm dealId={deal.id} /> : null}
          {can('CONFIRM_RECEIVED') ? <ConfirmPaymentForms dealId={deal.id} /> : null}
        </Card>
      ) : null}
      {deal.viewerSide === 'BRAND' && deal.status === 'PAYMENT_MARKED' ? (
        <Alert>{t('waitingForCreator')}</Alert>
      ) : null}

      <Card className="grid gap-3">
        <CardTitle>{t('posts.title')}</CardTitle>
        <DealPosts posts={deal.posts} locale={locale} countryCode={session.user.countryCode} />
        {can('ADD_POST') ? <PostLinkForm dealId={deal.id} /> : null}
      </Card>

      <Card className="grid gap-3">
        <CardTitle>{t('deliverablesTitle')}</CardTitle>
        <ul className="text-sm">
          {deal.deliverables.map((line) => (
            <li key={line.deliverable}>
              {tTerms('deliverableLine', {
                quantity: line.quantity,
                deliverable: tDeliverables(line.deliverable),
              })}
            </li>
          ))}
        </ul>
        <p className="text-sm">{tRights(deal.usageRights)}</p>
      </Card>

      {deal.status === 'COMPLETED' ? (
        <Card className="grid gap-4">
          <CardTitle>{tRatings('title')}</CardTitle>
          {ratings.canRate ? (
            <RatingForm
              dealId={deal.id}
              criteria={RATING_CRITERIA[deal.viewerSide]}
              otherPartyName={deal.otherPartyName}
            />
          ) : null}
          {ratings.mine ? (
            <div className="grid gap-1">
              <h3 className="text-sm font-medium">{tRatings('yourRating')}</h3>
              <RatingDetails rating={ratings.mine} />
              {ratings.revealAt ? (
                <p className="text-muted-foreground text-xs">
                  {tRatings('hiddenUntil', {
                    date: format.dateTime(ratings.revealAt, { dateStyle: 'medium' }),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          {ratings.theirs ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">
                {tRatings('theirRating', { name: deal.otherPartyName })}
              </h3>
              <RatingDetails rating={ratings.theirs} />
              <ReportRatingForm ratingId={ratings.theirs.id} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {tRatings('theirsPending', { name: deal.otherPartyName })}
            </p>
          )}
        </Card>
      ) : null}

      <DealHistory events={deal.events} />

      {can('CANCEL') ? (
        <Card className="grid gap-3">
          <CardTitle>{t('cancelTitle')}</CardTitle>
          <CancelDealForm dealId={deal.id} />
        </Card>
      ) : null}
    </PageShell>
  );
}
