/** Campaign report figures (FR-9.3, UC-R6). Pure: no I/O. */

const BASIS_POINTS = 10_000;
const VIEWS_PER_THOUSAND = 1000;

export interface ReportDeal {
  readonly isCancelled: boolean;
  readonly agreedAmountMinor: number | null;
  readonly posts: readonly {
    readonly views: number | null;
    readonly likes: number;
    readonly comments: number;
  }[];
}

export interface CampaignTotals {
  readonly dealCount: number;
  readonly postCount: number;
  /** Null when no post has view counts (e.g. Instagram only). */
  readonly views: number | null;
  readonly likes: number;
  readonly comments: number;
  /** (likes + comments) / views, in basis points; null without views. */
  readonly engagementRateBp: number | null;
  /** Agreed amounts of deals that have one, in minor units. */
  readonly spendMinor: number;
  /** Cost per 1,000 views and per engagement, from deals with a known amount only. */
  readonly costPerThousandViewsMinor: number | null;
  readonly costPerEngagementMinor: number | null;
}

function sumPosts(deals: readonly ReportDeal[]) {
  let views: number | null = null;
  let likes = 0;
  let comments = 0;
  for (const deal of deals) {
    for (const post of deal.posts) {
      if (post.views !== null) views = (views ?? 0) + post.views;
      likes += post.likes;
      comments += post.comments;
    }
  }
  return { views, likes, comments };
}

/**
 * FR-9.3: totals across a campaign's deals (cancelled deals left out). Costs are only
 * worked out where the amount is known, so a deal without an amount doesn't make the
 * others look cheaper.
 */
export function campaignTotals(deals: readonly ReportDeal[]): CampaignTotals {
  const active = deals.filter((deal) => !deal.isCancelled);
  const all = sumPosts(active);
  const priced = active.filter((deal) => deal.agreedAmountMinor !== null);
  const spendMinor = priced.reduce((sum, deal) => sum + (deal.agreedAmountMinor ?? 0), 0);
  const pricedTotals = sumPosts(priced);
  const pricedEngagements = pricedTotals.likes + pricedTotals.comments;
  return {
    dealCount: active.length,
    postCount: active.reduce((sum, deal) => sum + deal.posts.length, 0),
    ...all,
    engagementRateBp:
      all.views && all.views > 0
        ? Math.round(((all.likes + all.comments) / all.views) * BASIS_POINTS)
        : null,
    spendMinor,
    costPerThousandViewsMinor:
      priced.length > 0 && pricedTotals.views
        ? Math.round((spendMinor / pricedTotals.views) * VIEWS_PER_THOUSAND)
        : null,
    costPerEngagementMinor:
      priced.length > 0 && pricedEngagements > 0
        ? Math.round(spendMinor / pricedEngagements)
        : null,
  };
}
