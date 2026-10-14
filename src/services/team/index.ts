/** Team module: brand owners invite and remove members (UC-A6, UC-B3). */
import { generateSecureToken, hashToken } from '@/adapters/crypto/random-token';
import type { BrandMembership, PendingInvite, TeamMember } from '@/adapters/db/brand-repository';
import type { Repositories } from '@/adapters/db/repositories';
import { TEAM_INVITE_TTL_MS } from '@/config/auth';
import { normaliseEmail } from '@/domain/email-address';
import {
  invalidLink,
  invalidState,
  notAllowed,
  notFound,
  planLimitReached,
  validationFailed,
} from '@/domain/errors';
import { hasFreeSeat } from '@/domain/team';
import { maskEmail } from '@/lib/mask';
import {
  completeSignIn,
  createAccount,
  hashAcceptablePassword,
  type SignInResult,
} from '../accounts';
import type { RequestInfo, ServiceContext } from '../context';
import { queueEmail, requestEmailDispatch } from '../email';
import { consumeRateLimit, recordSecurityEvent } from '../security';

export interface TeamOverview {
  readonly brandName: string;
  readonly viewerRole: BrandMembership['role'];
  readonly seatLimit: number;
  readonly members: readonly TeamMember[];
  readonly pendingInvites: readonly PendingInvite[];
  readonly canInvite: boolean;
}

async function requireMembership(repos: Repositories, userId: string): Promise<BrandMembership> {
  const membership = await repos.brands.findMembership(userId);
  if (!membership) throw notAllowed();
  return membership;
}

async function requireOwnership(repos: Repositories, userId: string): Promise<BrandMembership> {
  const membership = await requireMembership(repos, userId);
  if (membership.role !== 'OWNER') throw notAllowed();
  return membership;
}

/** The brand this user belongs to, or null if none. */
export async function findBrandMembership(
  ctx: ServiceContext,
  userId: string,
): Promise<BrandMembership | null> {
  return ctx.repos.brands.findMembership(userId);
}

/** The viewer's brand team. Only that brand's members can see it (SR-5). */
export async function getTeamOverview(ctx: ServiceContext, userId: string): Promise<TeamOverview> {
  const now = ctx.clock.now();
  const membership = await requireMembership(ctx.repos, userId);
  const [members, pendingInvites] = await Promise.all([
    ctx.repos.brands.listMembers(membership.brandId),
    ctx.repos.brands.listPendingInvites(membership.brandId, now),
  ]);
  return {
    brandName: membership.brandName,
    viewerRole: membership.role,
    seatLimit: membership.seatLimit,
    members,
    pendingInvites: membership.role === 'OWNER' ? pendingInvites : [],
    canInvite:
      membership.role === 'OWNER' &&
      hasFreeSeat({
        memberCount: members.length,
        pendingInviteCount: pendingInvites.length,
        seatLimit: membership.seatLimit,
      }),
  };
}

/**
 * UC-A6: the owner invites someone by email. Refused when seats are full (counting pending
 * invites), when the email belongs to a creator, or when it's already in a brand.
 */
export async function inviteTeamMember(
  ctx: ServiceContext,
  input: { ownerUserId: string; email: string },
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  const email = normaliseEmail(input.email);
  const owner = await ctx.repos.users.findById(input.ownerUserId);
  if (!owner) throw notAllowed();

  await ctx.transaction(async (repos) => {
    const membership = await requireOwnership(repos, input.ownerUserId);
    await consumeRateLimit(repos, now, 'teamInvitePerBrand', membership.brandId);

    const existing = await repos.users.findByEmail(email);
    if (existing?.role === 'CREATOR' || existing?.role === 'ADMIN') {
      throw validationFailed({ email: 'team.notABrandAccount' });
    }
    if (existing && (await repos.brands.findMembership(existing.id))) {
      throw validationFailed({ email: 'team.alreadyInABrand' });
    }
    if (await repos.brands.hasPendingInviteFor(membership.brandId, email, now)) {
      throw validationFailed({ email: 'team.alreadyInvited' });
    }
    const seats = {
      memberCount: await repos.brands.countMembers(membership.brandId),
      pendingInviteCount: await repos.brands.countPendingInvites(membership.brandId, now),
      seatLimit: membership.seatLimit,
    };
    if (!hasFreeSeat(seats)) throw planLimitReached('seatsFull');

    const token = generateSecureToken();
    await repos.brands.createInvite({
      brandId: membership.brandId,
      email,
      tokenHash: hashToken(token),
      invitedByUserId: owner.id,
      expiresAt: new Date(now.getTime() + TEAM_INVITE_TTL_MS),
    });
    await queueEmail(repos, {
      userId: existing?.id ?? null,
      toAddress: email,
      locale: existing?.locale ?? owner.locale,
      template: 'teamInvite',
      payload: {
        brandName: membership.brandName,
        inviterName: owner.name,
        link: new URL(
          `/${existing?.locale ?? owner.locale}/invite/${token}`,
          ctx.appUrl,
        ).toString(),
      },
    });
    await recordSecurityEvent(repos, {
      action: 'team.invited',
      actorUserId: owner.id,
      ipAddress: request.ipAddress,
      metadata: { brandId: membership.brandId, email: maskEmail(email) },
    });
  });
  await requestEmailDispatch(ctx.jobQueue);
}

/** UC-A6: the owner withdraws a pending invite. Other brands' invites are "not found". */
export async function revokeTeamInvite(
  ctx: ServiceContext,
  input: { ownerUserId: string; inviteId: string },
  request: RequestInfo,
): Promise<void> {
  await ctx.transaction(async (repos) => {
    const membership = await requireOwnership(repos, input.ownerUserId);
    const isRevoked = await repos.brands.revokeInvite(
      membership.brandId,
      input.inviteId,
      ctx.clock.now(),
    );
    if (!isRevoked) throw notFound();
    await recordSecurityEvent(repos, {
      action: 'team.invite-revoked',
      actorUserId: input.ownerUserId,
      ipAddress: request.ipAddress,
      metadata: { brandId: membership.brandId },
    });
  });
}

/**
 * UC-A6: the owner removes a member. Their sessions end at once, so access stops
 * immediately. Owners can't be removed this way.
 */
export async function removeTeamMember(
  ctx: ServiceContext,
  input: { ownerUserId: string; memberUserId: string },
  request: RequestInfo,
): Promise<void> {
  await ctx.transaction(async (repos) => {
    const membership = await requireOwnership(repos, input.ownerUserId);
    if (!(await repos.brands.removeMember(membership.brandId, input.memberUserId))) {
      throw notFound();
    }
    await repos.sessions.deleteAllForUser(input.memberUserId);
    await recordSecurityEvent(repos, {
      action: 'team.member-removed',
      actorUserId: input.ownerUserId,
      subjectUserId: input.memberUserId,
      ipAddress: request.ipAddress,
      metadata: { brandId: membership.brandId },
    });
  });
}

/**
 * UC-A5: the owner makes another member the owner (and becomes a member), for example
 * before deleting their own account. Audited.
 */
export async function transferOwnership(
  ctx: ServiceContext,
  input: { ownerUserId: string; newOwnerUserId: string },
  request: RequestInfo,
): Promise<void> {
  await ctx.transaction(async (repos) => {
    const membership = await requireOwnership(repos, input.ownerUserId);
    const isTransferred = await repos.brands.transferOwnership(
      membership.brandId,
      input.ownerUserId,
      input.newOwnerUserId,
    );
    if (!isTransferred) throw notFound();
    await recordSecurityEvent(repos, {
      action: 'team.ownership-transferred',
      actorUserId: input.ownerUserId,
      subjectUserId: input.newOwnerUserId,
      ipAddress: request.ipAddress,
      metadata: { brandId: membership.brandId },
    });
  });
}

/** What the invite page shows, or null for an unknown, used or expired invite. */
export async function findInvite(
  ctx: ServiceContext,
  token: string,
): Promise<{ brandName: string; email: string } | null> {
  const invite = await ctx.repos.brands.findUsableInvite(hashToken(token), ctx.clock.now());
  return invite ? { brandName: invite.brandName, email: invite.email } : null;
}

/**
 * UC-A6: someone without an account accepts an invite by creating one. The invite link
 * proves the email, so the account is active straight away and signed in.
 */
export async function acceptInviteWithNewAccount(
  ctx: ServiceContext,
  input: { token: string; name: string; password: string; acceptsMarketing: boolean },
  request: RequestInfo,
): Promise<SignInResult> {
  const now = ctx.clock.now();
  const invite = await ctx.repos.brands.findUsableInvite(hashToken(input.token), now);
  if (!invite) throw invalidLink();
  if (await ctx.repos.users.findByEmail(invite.email)) {
    throw validationFailed({ email: 'team.signInToAccept' });
  }
  const passwordHash = await hashAcceptablePassword(ctx, input.password, invite.email);

  const user = await ctx.transaction(async (repos) => {
    if (!(await repos.brands.acceptInvite(invite.id, now))) throw invalidLink();
    const created = await createAccount(
      repos,
      now,
      {
        role: 'BRAND',
        name: input.name,
        email: invite.email,
        passwordHash,
        locale: request.locale,
        acceptsMarketing: input.acceptsMarketing,
        emailVerifiedAt: now,
        joinBrandId: invite.brandId,
      },
      request.ipAddress,
    );
    await recordSecurityEvent(repos, {
      action: 'team.joined',
      actorUserId: created.id,
      subjectUserId: created.id,
      ipAddress: request.ipAddress,
      metadata: { brandId: invite.brandId, method: 'new-account' },
    });
    return created;
  });
  return completeSignIn(ctx, user, request, 'password');
}

/** UC-A6: a signed-in brand user whose email matches the invite joins the brand. */
export async function acceptInviteAsSignedInUser(
  ctx: ServiceContext,
  input: { token: string; userId: string },
  request: RequestInfo,
): Promise<void> {
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    const invite = await repos.brands.findUsableInvite(hashToken(input.token), now);
    if (!invite) throw invalidLink();
    const user = await repos.users.findById(input.userId);
    if (!user || user.email !== invite.email) throw notAllowed();
    if (user.role !== 'BRAND') throw validationFailed({ email: 'team.notABrandAccount' });
    if (await repos.brands.findMembership(user.id)) throw invalidState();
    if (!(await repos.brands.acceptInvite(invite.id, now))) throw invalidLink();
    await repos.brands.addMember(invite.brandId, user.id, 'MEMBER');
    await recordSecurityEvent(repos, {
      action: 'team.joined',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { brandId: invite.brandId, method: 'existing-account' },
    });
  });
}
