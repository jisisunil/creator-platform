/**
 * Admin module: metrics, user management and platform switches (FR-13). Every function
 * checks the caller is an admin, and every change is written to the audit log (FR-13.3,
 * SEC-11).
 */
import type { PlatformMetrics, UserDetail, UserListItem } from '@/adapters/db/admin-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { PLATFORM_SETTING_DEFAULTS } from '@/config/platform-settings';
import type { UserRole, UserStatus } from '@/domain/accounts';
import { invalidState, notAllowed, notFound } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { requireAdmin } from '../security';
import { requestCreatorRefresh } from '../social';

export type { PlatformMetrics, UserDetail, UserListItem } from '@/adapters/db/admin-repository';

const DAY_MS = 86_400_000;
const METRICS_WINDOW_DAYS = 30;
const USERS_PAGE_SIZE = 25;

/** Records an admin action (FR-13.3). Metadata must not hold personal data beyond ids. */
async function auditAdminAction(
  repos: Repositories,
  event: {
    readonly adminUserId: string;
    readonly action: string;
    readonly subjectUserId?: string;
    readonly request: RequestInfo;
    readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
  },
): Promise<void> {
  await repos.audit.record({
    category: 'ADMIN',
    action: event.action,
    actorUserId: event.adminUserId,
    subjectUserId: event.subjectUserId ?? null,
    ipAddress: event.request.ipAddress,
    metadata: event.metadata,
  });
}

/** FR-13.4: sign-ups, active users, requests and completed deals in the last 30 days. */
export async function getPlatformMetrics(
  ctx: ServiceContext,
  adminUserId: string,
): Promise<PlatformMetrics & { readonly windowDays: number }> {
  await requireAdmin(ctx.repos, adminUserId);
  const since = new Date(ctx.clock.now().getTime() - METRICS_WINDOW_DAYS * DAY_MS);
  return { ...(await ctx.repos.admin.metricsSince(since)), windowDays: METRICS_WINDOW_DAYS };
}

export interface UserSearch {
  readonly query?: string;
  readonly role?: UserRole;
  readonly status?: UserStatus;
}

/** FR-13.1: finds users by name or email. */
export async function searchUsers(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly filters: UserSearch; readonly page: number },
): Promise<{ items: readonly UserListItem[]; page: number; pageCount: number }> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const page = Math.max(1, Math.floor(input.page));
  const result = await ctx.repos.admin.searchUsers(input.filters, {
    offset: (page - 1) * USERS_PAGE_SIZE,
    limit: USERS_PAGE_SIZE,
  });
  return {
    items: result.items,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / USERS_PAGE_SIZE)),
  };
}

/** FR-13.1: one user with their creator profile or brand. Viewing is audited (SEC-11). */
export async function getUserDetail(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly userId: string; readonly request: RequestInfo },
): Promise<UserDetail> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await ctx.repos.admin.findUserDetail(input.userId);
  if (!user) throw notFound();
  await auditAdminAction(ctx.repos, {
    adminUserId: input.adminUserId,
    action: 'user.viewed',
    subjectUserId: user.id,
    request: input.request,
  });
  return user;
}

/** Admin accounts are managed by operators, not from the console (least privilege, SEC-11). */
async function requireManageableUser(repos: Repositories, adminUserId: string, userId: string) {
  const user = await repos.users.findById(userId);
  if (!user) throw notFound();
  if (user.role === 'ADMIN' || user.id === adminUserId) throw notAllowed();
  return user;
}

/**
 * FR-13.1 / UC-M1: suspends a user with a reason. Their sessions end at once (SR-2); they
 * disappear from search and can't sign in or be contacted until reinstated.
 */
export async function suspendUser(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly userId: string;
    readonly reason: string;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await requireManageableUser(ctx.repos, input.adminUserId, input.userId);
  if (user.status !== 'ACTIVE') throw invalidState();
  await ctx.transaction(async (repos) => {
    await repos.admin.setUserStatus(user.id, 'SUSPENDED');
    await repos.sessions.deleteAllForUser(user.id);
    await auditAdminAction(repos, {
      adminUserId: input.adminUserId,
      action: 'user.suspended',
      subjectUserId: user.id,
      request: input.request,
      metadata: { reason: input.reason },
    });
  });
}

/** FR-13.1: reinstates a suspended user. */
export async function reinstateUser(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly userId: string; readonly request: RequestInfo },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await requireManageableUser(ctx.repos, input.adminUserId, input.userId);
  if (user.status !== 'SUSPENDED') throw invalidState();
  await ctx.transaction(async (repos) => {
    await repos.admin.setUserStatus(user.id, 'ACTIVE');
    await auditAdminAction(repos, {
      adminUserId: input.adminUserId,
      action: 'user.reinstated',
      subjectUserId: user.id,
      request: input.request,
    });
  });
}

/** FR-13.1: confirms the email of someone who can't complete verification themselves. */
export async function verifyUserEmail(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly userId: string; readonly request: RequestInfo },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const user = await requireManageableUser(ctx.repos, input.adminUserId, input.userId);
  if (user.emailVerifiedAt) throw invalidState();
  await ctx.transaction(async (repos) => {
    await repos.users.markEmailVerified(user.id, ctx.clock.now());
    await auditAdminAction(repos, {
      adminUserId: input.adminUserId,
      action: 'user.email-verified',
      subjectUserId: user.id,
      request: input.request,
    });
  });
}

/** FR-13.2: refreshes a creator's connected accounts now instead of waiting for the night. */
export async function refreshCreatorNow(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly userId: string; readonly request: RequestInfo },
): Promise<number> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const profile = await ctx.repos.creators.findByUserId(input.userId);
  if (!profile) throw notFound();
  const queued = await requestCreatorRefresh(ctx, profile.id);
  await auditAdminAction(ctx.repos, {
    adminUserId: input.adminUserId,
    action: 'creator.refresh-requested',
    subjectUserId: input.userId,
    request: input.request,
    metadata: { accounts: queued },
  });
  return queued;
}

/** UC-B1: whether new brands start on the free beta (on) or a trial (off). */
export async function getFreeBetaSetting(ctx: ServiceContext, adminUserId: string) {
  await requireAdmin(ctx.repos, adminUserId);
  return ctx.repos.reference.getBooleanSetting(
    'isFreeBetaActive',
    PLATFORM_SETTING_DEFAULTS.isFreeBetaActive,
  );
}

/** UC-B1: turns the free beta on or off for new brands. Existing brands keep their plan. */
export async function setFreeBeta(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly isActive: boolean;
    readonly request: RequestInfo;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  await ctx.transaction(async (repos) => {
    await repos.admin.setPlatformSetting('isFreeBetaActive', input.isActive);
    await auditAdminAction(repos, {
      adminUserId: input.adminUserId,
      action: 'setting.free-beta',
      request: input.request,
      metadata: { isActive: input.isActive },
    });
  });
}
