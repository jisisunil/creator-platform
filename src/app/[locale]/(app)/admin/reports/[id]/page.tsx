import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { DecisionButton, ReasonForm } from '@/components/admin/ModerationForms';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardTitle } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { getReport, type ReportView } from '@/services/moderation';
import {
  closeReportAction,
  openChatAction,
  setRatingHiddenAction,
  warnUserAction,
} from '../../moderation-actions';

/** UC-M1: one report; warn, hide a rating, open the chat with a reason, then close it. */
export default async function AdminReportPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.reports');
  const format = await getFormatter();

  let report: ReportView;
  try {
    report = await getReport(getContainer(), { adminUserId: session.user.id, reportId: id });
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const isOpen = report.status === 'OPEN';

  return (
    <PageShell title={t(`targets.${report.targetType}`)} intro={<AdminNav />} wide>
      <Card className="grid gap-2 text-sm">
        <CardTitle>{t('details')}</CardTitle>
        <p>
          <span className="font-medium">{t('about')}</span>{' '}
          {report.target ? report.target.label || t('noText') : t('targetGone')}
        </p>
        <p className="whitespace-pre-line">
          <span className="font-medium">{t('reason')}</span> {report.reason}
        </p>
        <p className="text-muted-foreground">
          {t('filed', {
            name: report.reporter?.name ?? t('deletedUser'),
            date: format.dateTime(report.createdAt, { dateStyle: 'medium', timeStyle: 'short' }),
          })}
        </p>
        {report.reporterHistory ? (
          <p className="text-muted-foreground">
            {t('reporterHistory', {
              total: report.reporterHistory.total,
              dismissed: report.reporterHistory.dismissed,
            })}
          </p>
        ) : null}
        {report.target?.userIds.length ? (
          <p>
            {t('people')}{' '}
            {report.target.userIds.map((userId, index) => (
              <span key={userId}>
                {index > 0 ? ', ' : ''}
                <Link href={`/admin/users/${userId}`} className="underline">
                  {t('account', { number: index + 1 })}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {report.resolution ? (
          <p>
            <span className="font-medium">{t('resolution')}</span> {report.resolution}
          </p>
        ) : null}
      </Card>

      {isOpen ? (
        <Card className="grid gap-6">
          <CardTitle>{t('actions')}</CardTitle>
          {report.targetType === 'RATING' && report.target?.rating ? (
            <DecisionButton
              action={setRatingHiddenAction}
              hidden={{
                ratingId: report.targetId,
                reportId: report.id,
                isHidden: report.target.rating.isHidden ? 'false' : 'true',
              }}
              label={report.target.rating.isHidden ? t('showRating') : t('hideRating')}
            />
          ) : null}
          {report.threadId ? (
            <ReasonForm
              action={openChatAction}
              hidden={{ threadId: report.threadId, reportId: report.id }}
              fieldName="reason"
              label={t('chatReason')}
              submitLabel={t('openChat')}
            />
          ) : null}
          {report.target?.userIds[0] && report.targetType !== 'PAYMENT' ? (
            <ReasonForm
              action={warnUserAction}
              hidden={{ userId: report.target.userIds[0], reportId: report.id }}
              fieldName="reason"
              label={t('warnReason')}
              submitLabel={t('warn')}
              successMessage={t('warned')}
            />
          ) : null}
          <div className="grid gap-6 sm:grid-cols-2">
            <ReasonForm
              action={closeReportAction}
              hidden={{ reportId: report.id, outcome: 'RESOLVED' }}
              fieldName="note"
              label={t('resolveNote')}
              submitLabel={t('resolve')}
            />
            <ReasonForm
              action={closeReportAction}
              hidden={{ reportId: report.id, outcome: 'DISMISSED' }}
              fieldName="note"
              label={t('dismissNote')}
              submitLabel={t('dismiss')}
              variant="ghost"
            />
          </div>
        </Card>
      ) : null}
    </PageShell>
  );
}
