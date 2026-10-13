import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { isDomainError } from '@/domain/errors';
import { type ActionState, SUCCESS } from './action-state';
import { getLogger } from './logger';
import { runWithRequestContext } from './request-context';

export { type ActionState, IDLE, SUCCESS } from './action-state';

const logger = getLogger('action');

/**
 * Runs a server action body. Domain errors become a typed error state for the form;
 * anything else is logged, sent to Sentry and shown as a generic error (CLAUDE.md §6).
 * Next.js redirects and not-found signals pass through untouched.
 */
export async function runAction(work: () => Promise<ActionState | void>): Promise<ActionState> {
  return runWithRequestContext({ requestId: randomUUID() }, async () => {
    try {
      return (await work()) ?? SUCCESS;
    } catch (error) {
      unstable_rethrow(error);
      if (isDomainError(error)) {
        return { status: 'error', code: error.code, fieldErrors: error.fieldErrors };
      }
      logger.error({ err: error }, 'unexpected error in server action');
      Sentry.captureException(error);
      return { status: 'error', code: 'INTERNAL' };
    }
  });
}
