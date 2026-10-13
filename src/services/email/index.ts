import type { Clock } from '@/adapters/clock';
import type { QueuedEmail } from '@/adapters/db/email-outbox-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { TransactionRunner } from '@/adapters/db/transaction';
import type { EmailSender } from '@/adapters/email/email-sender';
import { type EmailTemplates, renderEmail } from '@/adapters/email/templates';
import type { JobQueue } from '@/adapters/jobs/job-queue';
import { JOB_NAMES } from '@/config/jobs';
import { getLogger } from '@/lib/logger';

const logger = getLogger('email');

/** Gives up on an email after this many failed attempts. */
export const MAX_EMAIL_ATTEMPTS = 5;

/** Adds an email to the outbox; call inside the transaction that caused it. */
export async function queueEmail(repos: Repositories, email: QueuedEmail): Promise<void> {
  await repos.emailOutbox.add(email);
}

/** Asks the worker to send queued emails now. Call after the transaction commits. */
export async function requestEmailDispatch(jobQueue: JobQueue): Promise<void> {
  await jobQueue.enqueue(JOB_NAMES.dispatchEmails);
}

export interface DispatchDependencies {
  readonly transaction: TransactionRunner;
  readonly emailSender: EmailSender;
  readonly clock: Clock;
}

/**
 * Sends pending outbox emails one at a time, each in its own transaction so a slow or
 * failing send never blocks the rest. Returns counts for the job log.
 */
export async function dispatchPendingEmails(
  deps: DispatchDependencies,
  maxEmails: number,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < maxEmails; index += 1) {
    const outcome = await deps.transaction(async (repos) => {
      const email = await repos.emailOutbox.lockNextPending();
      if (!email) return 'empty' as const;
      try {
        const rendered = renderEmail(
          email.template,
          email.locale,
          email.payload as EmailTemplates[typeof email.template],
        );
        await deps.emailSender.send({ to: email.toAddress, ...rendered });
        await repos.emailOutbox.markSent(email.id, deps.clock.now());
        return 'sent' as const;
      } catch (error) {
        const isFinal = email.attempts + 1 >= MAX_EMAIL_ATTEMPTS;
        logger.warn({ err: error, emailId: email.id, isFinal }, 'email send failed');
        await repos.emailOutbox.markAttemptFailed(email.id, String(error), isFinal);
        return 'failed' as const;
      }
    });
    if (outcome === 'empty') break;
    if (outcome === 'sent') sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
