/** Campaigns module: a brand's campaigns and their reports (FR-9.3, UC-R6). */
import type { DealRecord } from '@/adapters/db/deal-repository';
import { type CampaignTotals, campaignTotals } from '@/domain/campaign-report';
import { notFound } from '@/domain/errors';
import type { ServiceContext } from '../context';
import { requireBrandMembership } from '../discovery';
import { recordSecurityEvent } from '../security';

export interface CampaignListItem {
  readonly id: string;
  readonly name: string;
  readonly requestCount: number;
  readonly dealCount: number;
  readonly updatedAt: Date;
}

/** FR-9.3: the brand's campaigns, most recently used first. */
export async function listCampaigns(
  ctx: ServiceContext,
  userId: string,
): Promise<CampaignListItem[]> {
  const membership = await requireBrandMembership(ctx.repos, userId);
  return ctx.repos.deals.listCampaigns(membership.brandId);
}

export interface CampaignReport {
  readonly id: string;
  readonly name: string;
  readonly deals: readonly DealRecord[];
  /** Currency of the amounts and costs (the brand's country currency). */
  readonly currencyCode: string;
  /** Null when the brand's plan doesn't include campaign reports (FR-11.1). */
  readonly totals: CampaignTotals | null;
}

/**
 * FR-9.3 / UC-R6: a campaign's deals and posts with totals: views, likes, comments,
 * engagement, and cost per 1,000 views or per engagement where amounts are known. The
 * totals need a plan with campaign reports. Another brand's campaign is "not found".
 */
export async function getCampaignReport(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly campaignId: string },
): Promise<CampaignReport> {
  const membership = await requireBrandMembership(ctx.repos, input.userId);
  const campaign = await ctx.repos.deals.findCampaign(input.campaignId);
  if (campaign?.brandId !== membership.brandId) {
    await recordSecurityEvent(ctx.repos, {
      action: 'access.denied',
      actorUserId: input.userId,
      metadata: { resource: 'campaign' },
    });
    throw notFound();
  }
  const deals = await ctx.repos.deals.listForCampaign(campaign.id);
  const country = await ctx.repos.reference.findCountry(membership.countryCode);
  if (!country) throw new Error(`Unknown country ${membership.countryCode}`);
  return {
    id: campaign.id,
    name: campaign.name,
    deals,
    currencyCode: deals[0]?.currencyCode ?? country.currencyCode,
    totals: membership.plan.canCampaignReports
      ? campaignTotals(
          deals.map((deal) => ({
            isCancelled: deal.status === 'CANCELLED',
            agreedAmountMinor: deal.agreedAmountMinor,
            posts: deal.posts,
          })),
        )
      : null,
  };
}
