import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { getContainer } from '@/adapters/container';
import { PageShell } from '@/components/layout/PageShell';
import { Card, CardTitle } from '@/components/ui/card';
import { CATEGORY_SLUGS_BY_COUNTRY } from '@/config/categories';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { REGION_CODES_BY_COUNTRY } from '@/config/regions';
import { requirePageSession } from '@/lib/auth/current-session';
import { fileUrlFor } from '@/lib/file-url';
import { getOwnProfile } from '@/services/creators';
import {
  AddPortfolioItemForm,
  AvailabilityForm,
  PhotoForm,
  ProfileDetailsForm,
  RateCardForm,
  RemovePortfolioItemButton,
} from './ProfileForms';

const DELIVERABLES = ['REEL', 'STORY', 'VIDEO', 'POST'] as const;
const PAISE_PER_RUPEE = 100;

/** FR-2: the creator's profile editor. */
export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['CREATOR'] });
  const profile = await getOwnProfile(getContainer(), session.user);
  const t = await getTranslations('creator.profile');
  const tCategories = await getTranslations('categories');
  const tRegions = await getTranslations('regions');
  const tDeliverables = await getTranslations('deliverables');
  const format = await getFormatter();
  const photoUrl = fileUrlFor(profile.photoKey);

  const states = (REGION_CODES_BY_COUNTRY[profile.countryCode] ?? [])
    .map((code) => ({ value: code, label: tRegions(`${profile.countryCode}.${code}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const categories = (CATEGORY_SLUGS_BY_COUNTRY[profile.countryCode] ?? []).map((slug) => ({
    value: slug,
    label: tCategories(slug),
  }));
  const languages = CONTENT_LANGUAGES.map((language) => ({
    value: language.code,
    label: language.nativeName,
  }));
  const rupeesByDeliverable = Object.fromEntries(
    profile.rateCard.map((item) => [item.deliverable, item.amountMinor / PAISE_PER_RUPEE]),
  );

  return (
    <PageShell title={t('title')}>
      <Card>
        <CardTitle>{t('photoTitle')}</CardTitle>
        <div className="mt-4 flex flex-wrap items-start gap-6">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={t('photoAlt')}
              width={96}
              height={96}
              unoptimized
              className="size-24 rounded-full object-cover"
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t('noPhoto')}</p>
          )}
          <PhotoForm />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('detailsTitle')}</CardTitle>
        <div className="mt-4">
          <ProfileDetailsForm
            profile={profile}
            states={states}
            languages={languages}
            categories={categories}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('availabilityTitle')}</CardTitle>
        <div className="mt-4">
          <AvailabilityForm isOpen={profile.isOpenToCollaborations} />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('rateCardTitle')}</CardTitle>
        <div className="mt-4">
          <RateCardForm
            deliverables={DELIVERABLES.map((value) => ({ value, label: tDeliverables(value) }))}
            rupeesByDeliverable={rupeesByDeliverable}
          />
        </div>
      </Card>

      <Card>
        <CardTitle>{t('portfolioTitle')}</CardTitle>
        {profile.portfolio.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">{t('portfolioEmpty')}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {profile.portfolio.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="underline"
                  >
                    {item.brandName}
                  </a>{' '}
                  <span className="text-muted-foreground">
                    {format.dateTime(item.collaboratedOn, { dateStyle: 'medium', timeZone: 'UTC' })}
                  </span>
                </span>
                <RemovePortfolioItemButton itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <AddPortfolioItemForm />
        </div>
      </Card>
    </PageShell>
  );
}
