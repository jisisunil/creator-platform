'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/i18n/navigation';

/**
 * FR-11.2 / UC-B2: an action the plan doesn't allow. Says why (`reasonKey`, an i18n key
 * under `fieldErrors`, e.g. "plan.trialEnded") and points to the upgrade options.
 */
export function PlanLimitAlert({ reasonKey }: { reasonKey?: string }) {
  const tFields = useTranslations('fieldErrors');
  const tErrors = useTranslations('errors');
  const t = useTranslations('plans');
  return (
    <Alert variant="destructive" className="grid gap-1">
      <span>{reasonKey ? tFields(reasonKey) : tErrors('PLAN_LIMIT_REACHED')}</span>
      <Link href="/brand/plan" className="font-medium underline">
        {t('seeUpgradeOptions')}
      </Link>
    </Alert>
  );
}
