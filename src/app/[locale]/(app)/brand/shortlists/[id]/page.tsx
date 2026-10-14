import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getContainer } from '@/adapters/container';
import { CreatorCard } from '@/components/brand/CreatorCard';
import {
  RemoveFromShortlistButton,
  ShortlistNoteForm,
  ShortlistOwnerControls,
} from '@/components/brand/DiscoveryForms';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isDomainError } from '@/domain/errors';
import { requirePageSession } from '@/lib/auth/current-session';
import { getShortlist } from '@/services/shortlists';

const COMPARE_FORM_ID = 'shortlist-compare-form';

/** FR-6.1 / UC-D3: one shortlist with notes; unavailable creators are flagged. */
export default async function ShortlistPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['BRAND'] });
  const t = await getTranslations('brand.shortlists');
  const tSearch = await getTranslations('brand.search');

  let shortlist;
  try {
    shortlist = await getShortlist(getContainer(), { userId: session.user.id, shortlistId: id });
  } catch (error) {
    // SEC-2: another brand's list, or one not shared with this user, looks like it doesn't exist.
    if (isDomainError(error) && (error.code === 'NOT_FOUND' || error.code === 'NOT_ALLOWED')) {
      notFound();
    }
    throw error;
  }

  return (
    <PageShell
      wide
      title={shortlist.name}
      intro={shortlist.isSharedWithTeam ? t('shared') : t('private')}
    >
      {shortlist.canManage ? (
        <Card>
          <ShortlistOwnerControls
            shortlistId={shortlist.id}
            name={shortlist.name}
            isShared={shortlist.isSharedWithTeam}
          />
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/shortlists/${shortlist.id}/csv`} download>
            {t('exportCsv')}
          </a>
        </Button>
        <form id={COMPARE_FORM_ID} method="get" action={`/${locale}/brand/compare`}>
          <Button type="submit" size="sm" variant="outline">
            {t('compare')}
          </Button>
        </form>
      </div>

      {shortlist.entries.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('emptyList')}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shortlist.entries.map((entry) =>
            entry.creator ? (
              <CreatorCard
                key={entry.itemId}
                creator={entry.creator}
                locale={locale}
                selectControl={
                  <input
                    type="checkbox"
                    name="ids"
                    value={entry.creator.id}
                    form={COMPARE_FORM_ID}
                    aria-label={tSearch('select', { name: entry.creator.displayName })}
                    className="accent-primary mt-1 size-4"
                  />
                }
              >
                <ShortlistNoteForm
                  shortlistId={shortlist.id}
                  itemId={entry.itemId}
                  note={entry.note}
                />
                <RemoveFromShortlistButton shortlistId={shortlist.id} itemId={entry.itemId} />
              </CreatorCard>
            ) : (
              <Card key={entry.itemId} className="grid gap-2">
                <p className="text-sm">{t('unavailable')}</p>
                <RemoveFromShortlistButton shortlistId={shortlist.id} itemId={entry.itemId} />
              </Card>
            ),
          )}
        </div>
      )}
    </PageShell>
  );
}
