/** Access requests module: the pilot waitlist (who asks to join while sign-up is invite-only). */
import type {
  AccessRequestRecord,
  AccessRequestStatus,
} from '@/adapters/db/access-request-repository';
import type { SelfServiceRole } from '@/domain/accounts';
import { isDisposableEmail, isInvitedToSignUp, normaliseEmail } from '@/domain/email-address';
import { captchaRequired, invalidState, notFound, validationFailed } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, requireAdmin } from '../security';

const QUEUE_PAGE_SIZE = 25;

export interface AccessRequestInput {
  readonly role: SelfServiceRole;
  readonly name: string;
  readonly email: string;
  readonly city: string | null;
  readonly profileUrl: string | null;
  readonly captchaToken: string | null;
}

/**
 * Puts someone on the pilot waitlist. Only while sign-up is invite-only. Whether the
 * address was already listed, invited or registered, the caller sees the same result,
 * so the form can't be used to discover who is on the platform.
 */
export async function requestAccess(
  ctx: ServiceContext,
  input: AccessRequestInput,
  request: RequestInfo,
): Promise<void> {
  if (ctx.signUpAllowlist === null) throw invalidState();
  const now = ctx.clock.now();
  await consumeRateLimit(ctx.repos, now, 'accessRequestPerIp', request.ipAddress);
  if (ctx.captcha.isEnabled && !(await ctx.captcha.verify(input.captchaToken, request.ipAddress))) {
    throw captchaRequired();
  }
  const email = normaliseEmail(input.email);
  if (isDisposableEmail(email)) throw validationFailed({ email: 'email.disposable' });
  if (isInvitedToSignUp(ctx.signUpAllowlist, email)) return;
  if (await ctx.repos.users.findByEmail(email)) return;

  await ctx.repos.accessRequests.addIfAbsent({
    email,
    name: input.name,
    role: input.role,
    city: input.city,
    profileUrl: input.profileUrl,
    locale: request.locale,
  });
}

/** Admin: waitlist requests by status; pending ones oldest first. */
export async function listAccessRequests(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly status: AccessRequestStatus;
    readonly page: number;
  },
): Promise<{ items: readonly AccessRequestRecord[]; page: number; pageCount: number }> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const page = Math.max(1, Math.floor(input.page));
  const result = await ctx.repos.accessRequests.list(input.status, {
    offset: (page - 1) * QUEUE_PAGE_SIZE,
    limit: QUEUE_PAGE_SIZE,
  });
  return {
    items: result.items,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / QUEUE_PAGE_SIZE)),
  };
}

/**
 * Admin: lets the person sign up with the address they gave, and emails them the sign-up
 * link. Audited without the address (SR-13).
 */
export async function approveAccessRequest(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly requestId: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const approved = await repos.accessRequests.approve(input.requestId, now);
    if (!approved) throw notFound();
    const signUpLink = new URL(`/${approved.locale}/sign-up`, ctx.appUrl);
    signUpLink.searchParams.set('role', approved.role);
    await queueEmail(repos, {
      userId: null,
      toAddress: approved.email,
      locale: approved.locale,
      template: 'accessApproved',
      payload: { name: approved.name, link: signUpLink.toString() },
    });
    await repos.audit.record({
      category: 'ADMIN',
      action: 'access-request.approved',
      actorUserId: input.adminUserId,
      ipAddress: input.request.ipAddress,
      metadata: { requestId: approved.id, role: approved.role },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/** Admin: removes a request without inviting the person (nothing is kept about them). */
export async function declineAccessRequest(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly requestId: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  await ctx.transaction(async (repos) => {
    if (!(await repos.accessRequests.delete(input.requestId))) throw notFound();
    await repos.audit.record({
      category: 'ADMIN',
      action: 'access-request.declined',
      actorUserId: input.adminUserId,
      ipAddress: input.request.ipAddress,
      metadata: { requestId: input.requestId },
    });
  });
}
