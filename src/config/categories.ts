/**
 * Fixed content categories per country (FR-2.1). Display names live in i18n under
 * `categories.<slug>`; adding a slug here needs a translation in every locale file.
 */
export const CATEGORY_SLUGS_BY_COUNTRY: Readonly<Record<string, readonly string[]>> = {
  IN: [
    'food',
    'travel',
    'fashion',
    'beauty',
    'fitness',
    'health',
    'tech',
    'gaming',
    'education',
    'finance',
    'comedy',
    'music',
    'dance',
    'lifestyle',
    'parenting',
    'automobile',
    'agriculture',
    'devotional',
    'sports',
    'home-decor',
  ],
};
