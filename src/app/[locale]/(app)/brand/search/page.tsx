import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getContainer } from '@/adapters/container';
import { CreatorCard } from '@/components/brand/CreatorCard';
import { AddToShortlistForm, SaveSearchForm } from '@/components/brand/DiscoveryForms';
import { PageShell } from '@/components/layout/PageShell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { CATEGORY_SLUGS_BY_COUNTRY } from '@/config/categories';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { REGION_CODES_BY_COUNTRY } from '@/config/regions';
import { AUDIENCE_AGE_BUCKETS } from '@/config/search';
import { TIER_LOWER_BOUNDS } from '@/config/score';
import { isDomainError } from '@/domain/errors';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { parseSearchParams, toSearchQuery } from '@/lib/validation/search-schemas';
import { searchCreators } from '@/services/discovery';
import { listShortlists } from '@/services/shortlists';
import { findBrandMembership } from '@/services/team';

const SORTS = ['score', 'engagement', 'followers', 'growth'] as const;
const TIERS = Object.keys(TIER_LOWER_BOUNDS) as (keyof typeof TIER_LOWER_BOUNDS)[];
const COMPARE_FORM_ID = 'compare-form';

function CheckboxList({
  name,
  legend,
  options,
  selected,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[] | undefined;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid max-h-40 gap-1 overflow-auto pr-1">
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected?.includes(option.value)}
              className="accent-primary size-4"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** FR-5 / UC-D1: creator search for brands. Filters live in the URL (bookmark, share, save). */
export default async function BrandSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('brand.search');
  const container = getContainer();
  const membership = await findBrandMembership(container, session.user.id);
  if (!membership) {
    const tDashboard = await getTranslations('dashboard');
    return (
      <PageShell title={t('title')}>
        <Alert>{tDashboard('brandNoTeam')}</Alert>
      </PageShell>
    );
  }

  const { filters, sort, page } = parseSearchParams(await searchParams);
  const tCategories = await getTranslations('categories');
  const tRegions = await getTranslations('regions');
  const tTiers = await getTranslations('tiers');
  const tPlatforms = await getTranslations('platforms');
  const tErrors = await getTranslations('errors');
  const country = membership.countryCode;

  let results;
  try {
    results = await searchCreators(container, { userId: session.user.id, filters, sort, page });
  } catch (error) {
    if (!isDomainError(error) || error.code !== 'RATE_LIMITED') throw error;
    return (
      <PageShell title={t('title')}>
        <Alert variant="destructive">{tErrors('RATE_LIMITED')}</Alert>
      </PageShell>
    );
  }
  const shortlists = (await listShortlists(container, session.user.id)).map(({ id, name }) => ({
    id,
    name,
  }));
  const states = (REGION_CODES_BY_COUNTRY[country] ?? [])
    .map((code) => ({ code, label: tRegions(`${country}.${code}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const query = toSearchQuery(filters, sort);
  const pageHref = (target: number) => `/brand/search?${toSearchQuery(filters, sort, target)}`;

  return (
    <PageShell wide title={t('title')}>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside>
          <Card>
            <CardTitle>{t('filtersTitle')}</CardTitle>
            <form method="get" className="mt-4 grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="filter-q">{t('query')}</Label>
                <Input id="filter-q" name="q" defaultValue={filters.query ?? ''} maxLength={100} />
              </div>
              <CheckboxList
                name="platform"
                legend={t('platform')}
                options={(['YOUTUBE', 'INSTAGRAM'] as const).map((value) => ({
                  value,
                  label: tPlatforms(value),
                }))}
                selected={filters.platforms}
              />
              <CheckboxList
                name="category"
                legend={t('category')}
                options={(CATEGORY_SLUGS_BY_COUNTRY[country] ?? []).map((slug) => ({
                  value: slug,
                  label: tCategories(slug),
                }))}
                selected={filters.categories}
              />
              <CheckboxList
                name="language"
                legend={t('language')}
                options={CONTENT_LANGUAGES.map((language) => ({
                  value: language.code,
                  label: language.nativeName,
                }))}
                selected={filters.languages}
              />
              <CheckboxList
                name="tier"
                legend={t('tier')}
                options={TIERS.map((tier) => ({ value: tier, label: tTiers(tier) }))}
                selected={filters.tiers}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="filter-state">{t('state')}</Label>
                <NativeSelect id="filter-state" name="state" defaultValue={filters.stateCode ?? ''}>
                  <option value="">{t('anyState')}</option>
                  {states.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-city">{t('city')}</Label>
                <Input
                  id="filter-city"
                  name="city"
                  defaultValue={filters.city ?? ''}
                  maxLength={80}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-min-followers">{t('minFollowers')}</Label>
                  <Input
                    id="filter-min-followers"
                    name="minFollowers"
                    inputMode="numeric"
                    defaultValue={filters.minFollowers ?? ''}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-max-followers">{t('maxFollowers')}</Label>
                  <Input
                    id="filter-max-followers"
                    name="maxFollowers"
                    inputMode="numeric"
                    defaultValue={filters.maxFollowers ?? ''}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-engagement">{t('minEngagement')}</Label>
                  <Input
                    id="filter-engagement"
                    name="minEngagement"
                    inputMode="decimal"
                    defaultValue={filters.minEngagementPercent ?? ''}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-score">{t('minScore')}</Label>
                  <Input
                    id="filter-score"
                    name="minScore"
                    inputMode="numeric"
                    defaultValue={filters.minScore ?? ''}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="verified"
                  value="1"
                  defaultChecked={filters.isVerifiedOnly}
                  className="accent-primary size-4"
                />
                {t('verified')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="open"
                  value="1"
                  defaultChecked={filters.isOpenOnly}
                  className="accent-primary size-4"
                />
                {t('open')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-gender">{t('audienceGender')}</Label>
                  <NativeSelect
                    id="filter-gender"
                    name="gender"
                    defaultValue={filters.audienceGender ?? ''}
                  >
                    <option value="">{t('any')}</option>
                    <option value="F">{t('women')}</option>
                    <option value="M">{t('men')}</option>
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="filter-age">{t('audienceAge')}</Label>
                  <NativeSelect id="filter-age" name="age" defaultValue={filters.audienceAge ?? ''}>
                    <option value="">{t('any')}</option>
                    {AUDIENCE_AGE_BUCKETS.map((bucket) => (
                      <option key={bucket} value={bucket}>
                        {bucket}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-sort">{t('sort')}</Label>
                <NativeSelect id="filter-sort" name="sort" defaultValue={sort}>
                  {SORTS.map((value) => (
                    <option key={value} value={value}>
                      {t(`sorts.${value}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button type="submit">{t('apply')}</Button>
              <Link href="/brand/search" className="text-center text-sm underline">
                {t('reset')}
              </Link>
            </form>
          </Card>
          <Card className="mt-6">
            <CardTitle>{t('saveTitle')}</CardTitle>
            <div className="mt-4">
              <SaveSearchForm query={query} />
            </div>
          </Card>
        </aside>

        <section aria-live="polite" className="grid content-start gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{t('results', { total: results.total })}</p>
            <form
              id={COMPARE_FORM_ID}
              method="get"
              action={`/${locale}/brand/compare`}
              className="flex items-center gap-2"
            >
              <span className="text-muted-foreground text-xs">{t('compareHint')}</span>
              <Button type="submit" size="sm" variant="outline">
                {t('compareSelected')}
              </Button>
            </form>
          </div>

          {results.total === 0 ? (
            <Card>
              <p>{t('noResults')}</p>
              {results.suggestions.length > 0 ? (
                <>
                  <p className="mt-3 text-sm font-medium">{t('tryInstead')}</p>
                  <ul className="mt-1 grid gap-1 text-sm">
                    {results.suggestions.map((suggestion) => (
                      <li key={suggestion.kind}>
                        <Link
                          href={`/brand/search?${toSearchQuery(suggestion.filters, sort)}`}
                          className="underline"
                        >
                          {t(`widenings.${suggestion.kind}`)}
                        </Link>{' '}
                        <span className="text-muted-foreground">
                          {t('wideningCount', { count: suggestion.total })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {results.items.map((creator) => (
                <CreatorCard
                  key={creator.id}
                  creator={creator}
                  locale={locale}
                  selectControl={
                    <input
                      type="checkbox"
                      name="ids"
                      value={creator.id}
                      form={COMPARE_FORM_ID}
                      aria-label={t('select', { name: creator.displayName })}
                      className="accent-primary mt-1 size-4"
                    />
                  }
                >
                  <AddToShortlistForm creatorId={creator.id} shortlists={shortlists} />
                </CreatorCard>
              ))}
            </div>
          )}

          {results.pageCount > 1 ? (
            <nav
              aria-label={t('pageOf', { page: results.page, pageCount: results.pageCount })}
              className="flex items-center justify-between gap-2 text-sm"
            >
              {results.page > 1 ? (
                <Link href={pageHref(results.page - 1)} className="underline">
                  {t('previous')}
                </Link>
              ) : (
                <span />
              )}
              <span>{t('pageOf', { page: results.page, pageCount: results.pageCount })}</span>
              {results.page < results.pageCount ? (
                <Link href={pageHref(results.page + 1)} className="underline">
                  {t('next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
