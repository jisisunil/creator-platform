/**
 * Monitoring module (SR-14): checks the audit log for failed-login spikes, unusual export
 * volume and admin actions outside working hours, and data requests close to their legal
 * deadline (PR-5). Alerts are logged at error level (for log-based alerting in production)
 * and emailed to the operations address when one is set. Error spikes are Sentry's job.
 * Also watches YouTube/Instagram API quota use and stale creator data (NFR-3, NFR-13).
 */
import { SOCIAL_REFRESH } from '@/config/creators';
import { MONITORING } from '@/config/monitoring';
import { isOutsideWorkingHours } from '@/domain/monitoring';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';

const logger = getLogger('monitoring');

type MonitoringDeps = Pick<ServiceContext, 'repos' | 'clock' | 'jobQueue'> & {
  /** Where alerts are emailed; null to only log them. */
  readonly alertEmail: string | null;
};

interface Alert {
  readonly alert: string;
  readonly details: string;
}

async function raise(deps: MonitoringDeps, alerts: readonly Alert[]): Promise<void> {
  for (const alert of alerts) {
    logger.error(
      { event: 'alert', alert: alert.alert, details: alert.details },
      'monitoring alert',
    );
    if (deps.alertEmail) {
      await queueEmail(deps.repos, {
        userId: null,
        toAddress: deps.alertEmail,
        locale: 'en',
        template: 'opsAlert',
        payload: alert,
      });
    }
  }
  if (alerts.length > 0 && deps.alertEmail) await requestEmailDispatch(deps.jobQueue);
}

/** SR-14: every 15 minutes, looks at the last 15 minutes of the audit log. */
export async function runSecurityChecks(deps: MonitoringDeps): Promise<{ alerts: number }> {
  const since = new Date(deps.clock.now().getTime() - MONITORING.windowMs);
  const alerts: Alert[] = [];

  const failedLogins = await deps.repos.audit.countActionSince('login.failure', since);
  if (failedLogins >= MONITORING.failedLoginSpike) {
    alerts.push({
      alert: 'failed-login-spike',
      details: `${failedLogins} failed sign-ins in 15 minutes`,
    });
  }
  const exports = await deps.repos.audit.countActionSince('data.exported', since);
  if (exports >= MONITORING.exportVolume) {
    alerts.push({ alert: 'export-volume', details: `${exports} data exports in 15 minutes` });
  }
  const offHours = (await deps.repos.audit.listAdminActionsSince(since)).filter((event) =>
    isOutsideWorkingHours(event.createdAt, MONITORING.workingHours),
  );
  if (offHours.length > 0) {
    const admins = new Set(offHours.map((event) => event.actorUserId)).size;
    alerts.push({
      alert: 'admin-off-hours',
      details: `${offHours.length} admin actions by ${admins} admin(s) outside working hours: ${[
        ...new Set(offHours.map((event) => event.action)),
      ].join(', ')}`,
    });
  }
  await raise(deps, alerts);
  return { alerts: alerts.length };
}

/** PR-5: daily, flags data requests that are overdue or due within 5 days. */
export async function checkDataRequestDeadlines(deps: MonitoringDeps): Promise<{ alerts: number }> {
  const now = deps.clock.now();
  const overdue = await deps.repos.privacy.countOpenDueBefore(now);
  const dueSoon =
    (await deps.repos.privacy.countOpenDueBefore(
      new Date(now.getTime() + MONITORING.dataRequestWarningMs),
    )) - overdue;
  const alerts: Alert[] = [];
  if (overdue > 0) {
    alerts.push({
      alert: 'data-requests-overdue',
      details: `${overdue} data requests are overdue`,
    });
  }
  if (dueSoon > 0) {
    alerts.push({ alert: 'data-requests-due-soon', details: `${dueSoon} due within 5 days` });
  }
  await raise(deps, alerts);
  return { alerts: alerts.length };
}

/**
 * NFR-13 / NFR-3: daily, alerts when platform API quota ran out for some accounts (time to
 * ask for more quota or spread refreshes) or when creator stats are older than 48 hours.
 */
export async function checkSocialDataHealth(deps: MonitoringDeps): Promise<{ alerts: number }> {
  const staleBefore = new Date(deps.clock.now().getTime() - SOCIAL_REFRESH.maxDataAgeMs);
  const health = await deps.repos.socialAccounts.refreshHealth(staleBefore);
  const alerts: Alert[] = [];
  const quotaHits = Object.entries(health.quotaHitsByPlatform);
  if (quotaHits.length > 0) {
    alerts.push({
      alert: 'api-quota-exceeded',
      details: `Accounts waiting for API quota: ${quotaHits
        .map(([platform, count]) => `${platform} ${count}`)
        .join(', ')}`,
    });
  }
  if (health.stale > 0) {
    alerts.push({
      alert: 'stale-social-data',
      details: `${health.stale} active accounts not refreshed in 48 hours`,
    });
  }
  await raise(deps, alerts);
  return { alerts: alerts.length };
}
