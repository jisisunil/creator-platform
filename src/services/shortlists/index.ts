/** Shortlists module: named creator lists with notes, team sharing and CSV export (FR-6, UC-D3). */
import type { ShortlistAccess, ShortlistSummary } from '@/adapters/db/shortlist-repository';
import type { CreatorSearchResult } from '@/adapters/db/search-repository';
import { toCsv } from '@/domain/csv';
import { notAllowed, notFound, planLimitReached } from '@/domain/errors';
import type { ServiceContext } from '../context';
import { requireBrandMembership } from '../discovery';
import { recordSecurityEvent } from '../security';

/**
 * Loads a shortlist the user may see (their own, or shared with their brand's team).
 * Anything else, including another brand's list, is "not found" and the attempt is logged
 * (SEC-2).
 */
async function requireVisibleShortlist(
  ctx: ServiceContext,
  userId: string,
  shortlistId: string,
): Promise<ShortlistAccess & { isOwnerOrBrandOwner: boolean }> {
  const membership = await requireBrandMembership(ctx.repos, userId);
  const shortlist = await ctx.repos.shortlists.findVisible(shortlistId, membership.brandId, userId);
  if (!shortlist) {
    await recordSecurityEvent(ctx.repos, {
      action: 'access.denied',
      actorUserId: userId,
      metadata: { resource: 'shortlist' },
    });
    throw notFound();
  }
  return {
    ...shortlist,
    isOwnerOrBrandOwner: shortlist.createdByUserId === userId || membership.role === 'OWNER',
  };
}

/** FR-6.1: the shortlists this user can see. */
export async function listShortlists(
  ctx: ServiceContext,
  userId: string,
): Promise<ShortlistSummary[]> {
  const membership = await requireBrandMembership(ctx.repos, userId);
  return ctx.repos.shortlists.listVisible(membership.brandId, userId);
}

/** FR-6.1: creates a named shortlist, within the plan's shortlist limit. */
export async function createShortlist(
  ctx: ServiceContext,
  input: { userId: string; name: string },
): Promise<string> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const count = await ctx.repos.shortlists.countForBrand(membership.brandId);
  if (count >= membership.plan.shortlistLimit) throw planLimitReached();
  return ctx.repos.shortlists.create({
    brandId: membership.brandId,
    createdByUserId: input.userId,
    name: input.name,
  });
}

export interface ShortlistDetail {
  readonly id: string;
  readonly name: string;
  readonly isSharedWithTeam: boolean;
  readonly canManage: boolean;
  readonly entries: readonly {
    readonly itemId: string;
    readonly note: string;
    /** Null when the creator is no longer available (UC-D3). */
    readonly creator: CreatorSearchResult | null;
  }[];
}

/** FR-6.1 / UC-D3: a shortlist's creators and notes; unavailable creators are flagged. */
export async function getShortlist(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string },
): Promise<ShortlistDetail> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  const entries = await ctx.repos.shortlists.entries(shortlist.id);
  const cards = await ctx.repos.search.findResultsByIds(
    entries.filter((entry) => entry.isCreatorAvailable).map((entry) => entry.creatorId),
  );
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return {
    id: shortlist.id,
    name: await ctx.repos.shortlists.getName(shortlist.id),
    isSharedWithTeam: shortlist.isSharedWithTeam,
    canManage: shortlist.isOwnerOrBrandOwner,
    entries: entries.map((entry) => ({
      itemId: entry.itemId,
      note: entry.note,
      creator: entry.isCreatorAvailable ? (cardById.get(entry.creatorId) ?? null) : null,
    })),
  };
}

/** FR-6.1: renames a shortlist (its maker or the brand owner). */
export async function renameShortlist(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; name: string },
): Promise<void> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  if (!shortlist.isOwnerOrBrandOwner) throw notAllowed();
  await ctx.repos.shortlists.rename(shortlist.id, input.name);
}

/** FR-6.1: shares a shortlist with the brand's team, or makes it private again. */
export async function setShortlistShared(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; isShared: boolean },
): Promise<void> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  if (!shortlist.isOwnerOrBrandOwner) throw notAllowed();
  await ctx.repos.shortlists.setShared(shortlist.id, input.isShared);
}

/** FR-6.1: deletes a shortlist (its maker or the brand owner). */
export async function deleteShortlist(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string },
): Promise<void> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  if (!shortlist.isOwnerOrBrandOwner) throw notAllowed();
  await ctx.repos.shortlists.delete(shortlist.id);
}

/**
 * FR-6.1 / UC-D3: adds a creator; adding one already on the list is ignored. Only creators
 * available in search can be added.
 */
export async function addToShortlist(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; creatorId: string },
): Promise<{ wasAdded: boolean }> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  const [card] = await ctx.repos.search.findResultsByIds([input.creatorId]);
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  if (!card || card.countryCode !== membership.countryCode) throw notFound();
  return { wasAdded: await ctx.repos.shortlists.addCreator(shortlist.id, input.creatorId) };
}

/** FR-6.1: removes a creator from the list. */
export async function removeFromShortlist(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; itemId: string },
): Promise<void> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  if (!(await ctx.repos.shortlists.removeItem(shortlist.id, input.itemId))) throw notFound();
}

/** FR-6.1: the brand's private note about a shortlisted creator. */
export async function setShortlistNote(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; itemId: string; note: string },
): Promise<void> {
  const shortlist = await requireVisibleShortlist(ctx, input.userId, input.shortlistId);
  if (!(await ctx.repos.shortlists.setNote(shortlist.id, input.itemId, input.note))) {
    throw notFound();
  }
}

export interface CsvLabels {
  readonly headers: readonly string[];
  readonly yes: string;
  readonly no: string;
}

/**
 * FR-6.3: the shortlist as CSV with public profile fields only (SR-12, SEC-3: no contact
 * details, no bulk contact data). Plans with CSV export only.
 */
export async function exportShortlistCsv(
  ctx: ServiceContext,
  input: { userId: string; shortlistId: string; labels: CsvLabels },
): Promise<{ filename: string; csv: string }> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  if (!membership.plan.canCsvExport) throw planLimitReached();
  const detail = await getShortlist(ctx, input);
  const rows = detail.entries
    .filter((entry) => entry.creator !== null)
    .map(({ creator, note }) => {
      const card = creator as CreatorSearchResult;
      return [
        card.displayName,
        new URL(`/c/${card.slug}`, ctx.appUrl).toString(),
        card.city,
        card.stateCode,
        card.categorySlugs.join('; '),
        card.platforms.join('; '),
        card.tier ?? '',
        card.totalFollowers,
        (card.engagementRateBp / 100).toFixed(1),
        card.currentScore,
        card.isVerified ? input.labels.yes : input.labels.no,
        note,
      ];
    });
  const safeName = detail.name.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 40) || 'shortlist';
  return { filename: `${safeName}.csv`, csv: toCsv(input.labels.headers, rows) };
}
