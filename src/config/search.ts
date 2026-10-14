/** Brand search and discovery tunables (FR-5, FR-6, UC-D). */

/** UC-D1: results per page, and how deep paging may go (very broad searches). */
export const SEARCH_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE = 50;

/** FR-5.3: at most this many "widen your search" suggestions. */
export const MAX_SEARCH_SUGGESTIONS = 3;

/**
 * Audience filters (FR-5.1) match creators whose audience has at least this share
 * (thousandths) in the chosen bucket: "mostly women" means at least 50%.
 */
export const AUDIENCE_GENDER_MIN_PERMILLE = 500;
export const AUDIENCE_AGE_MIN_PERMILLE = 300;
export const AUDIENCE_AGE_BUCKETS = ['18-24', '25-34', '35+'] as const;

/** UC-D4: how many creators can be compared side by side. */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export const SHORTLIST_NAME_MAX = 80;
export const SHORTLIST_NOTE_MAX = 500;
export const SAVED_SEARCH_NAME_MAX = 80;
/** Upper bound on saved searches per brand, independent of plan. */
export const MAX_SAVED_SEARCHES_PER_BRAND = 50;

/** Bumped when the saved filter shape changes (UC-D5). */
export const SEARCH_FILTERS_VERSION = 1;
