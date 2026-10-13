/** Brand industries offered at sign-up. Display names live in i18n under `industries.<slug>`. */
export const BRAND_INDUSTRIES = [
  'food-beverage',
  'fashion-apparel',
  'beauty-personal-care',
  'health-wellness',
  'electronics',
  'home-living',
  'education',
  'finance',
  'travel-hospitality',
  'automotive',
  'retail',
  'agency',
  'other',
] as const;

export type BrandIndustry = (typeof BRAND_INDUSTRIES)[number];
