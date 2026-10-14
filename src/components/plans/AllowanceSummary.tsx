import { getFormatter, getTranslations } from 'next-intl/server';
import type { ContactAllowance } from '@/services/plans';

/** The plan-limit reason (an i18n key under `fieldErrors`) when no request can be sent now. */
export function contactBlockedReason(allowance: ContactAllowance): string | null {
  if (allowance.kind === 'TRIAL_ENDED') return 'plan.trialEnded';
  if (allowance.remaining > 0) return null;
  return allowance.kind === 'CREDITS' ? 'plan.noCredits' : 'plan.requestsUsed';
}

/** FR-11.1: how many contact requests are left, and when they renew or the trial ended. */
export async function AllowanceSummary({ allowance }: { allowance: ContactAllowance }) {
  const t = await getTranslations('plans.allowance');
  const format = await getFormatter();
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium' });
  if (allowance.kind === 'TRIAL_ENDED') {
    return <span>{t('trialEnded', { date: date(allowance.trialEndedAt) })}</span>;
  }
  if (allowance.kind === 'CREDITS') {
    return <span>{t('credits', { remaining: allowance.remaining })}</span>;
  }
  return (
    <span>
      {t('period', { remaining: allowance.remaining, limit: allowance.limit })}{' '}
      {allowance.renewsAt ? t('renews', { date: date(allowance.renewsAt) }) : t('noRenewal')}
    </span>
  );
}
