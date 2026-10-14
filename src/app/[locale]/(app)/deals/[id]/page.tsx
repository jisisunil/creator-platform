import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import {
  DealHistory,
  DealPosts,
  DealProgress,
  DealStatusBadge,
} from '@/components/deals/DealDisplay';
import {
  CancelDealForm,
  ConfirmPaymentForms,
  DealTermsForm,
  MarkPaidForm,
  PostLinkForm,
  SubmitContentForm,
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
import { type DealView, getDeal } from '@/services/deals';
import { getDealRatings } from '@/services/ratings';

const PAISE_PER_RUPEE = 100;

/** FR-9 / UC-R4 to UC-R6: one deal, its terms, posts, history and the viewer's next steps. */
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

  let deal: DealView;
  try {
    deal = await getDeal(getContainer(), { userId: session.user.id, dealId: id });
  } catch (error) {
    // SEC-2: someone else's deal looks like it doesn't exist.
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const ratings = await getDealRatings(getContainer(), { userId: session.user.id, dealId: id });
  const tRatings = await getTranslations('ratings');
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, deal.currencyCode, locale, session.user.countryCode);
  const can = (action: DealView['allowedActions'][number]) => deal.allowedActions.includes(action);
  const requestPath =
    deal.viewerSide === 'BRAND'
      ? `/brand/requests/${deal.requestId}`
      : `/creator/requests/${deal.requestId}`;

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

      <Card className="grid gap-3">
        <CardTitle>{t('terms.title')}</CardTitle>
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
                : t('terms.dueAfterPosting')}
            </dd>
          </div>
        </dl>
        {can('UPDATE_TERMS') ? (
          <DealTermsForm
            dealId={deal.id}
            agreedAmountRupees={
              deal.agreedAmountMinor === null ? null : deal.agreedAmountMinor / PAISE_PER_RUPEE
            }
            advancePercent={deal.advancePercent}
            paymentDueOn={deal.paymentDueOn?.toISOString().slice(0, 10) ?? null}
          />
        ) : null}
      </Card>

      {can('SUBMIT_CONTENT') || can('ADD_POST') || can('MARK_PAID') || can('CONFIRM_RECEIVED') ? (
        <Card className="grid gap-6">
          <CardTitle>{t('nextStep')}</CardTitle>
          {can('SUBMIT_CONTENT') ? <SubmitContentForm dealId={deal.id} /> : null}
          {can('ADD_POST') ? <PostLinkForm dealId={deal.id} /> : null}
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
