import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { AllowanceSummary, contactBlockedReason } from '@/components/plans/AllowanceSummary';
import { PlanLimitAlert } from '@/components/plans/PlanLimitAlert';
import { SendRequestForm } from '@/components/requests/RequestForms';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { findRequestTarget, getRequestFormContext } from '@/services/requests';
import { findBrandMembership } from '@/services/team';

/** FR-7.1 / UC-R1: write a collaboration request to one creator (?creator=<slug>). */
export default async function NewRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('requests.new');
  const container = getContainer();
  const slug = (await searchParams).creator;
  const target =
    typeof slug === 'string' && (await findBrandMembership(container, session.user.id))
      ? await findRequestTarget(container, { userId: session.user.id, slug })
      : null;
  if (!target) {
    return (
      <PageShell title={t('title')}>
        <Alert>{t('noCreator')}</Alert>
        <Link href="/brand/search" className="underline">
          {t('backToSearch')}
        </Link>
      </PageShell>
    );
  }
  if (!target.isOpen) {
    return (
      <PageShell title={t('titleFor', { name: target.displayName })}>
        <Alert>{t('notOpen')}</Alert>
      </PageShell>
    );
  }

  const context = await getRequestFormContext(container, session.user.id);
  const blockedReason = contactBlockedReason(context.allowance);
  return (
    <PageShell
      title={t('titleFor', { name: target.displayName })}
      intro={<AllowanceSummary allowance={context.allowance} />}
    >
      {blockedReason ? (
        <PlanLimitAlert reasonKey={blockedReason} />
      ) : (
        <Card>
          <SendRequestForm
            creatorId={target.id}
            campaignNames={context.campaignNames}
            minDeadline={context.minDeadline}
          />
        </Card>
      )}
    </PageShell>
  );
}
