import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { getContainer } from '@/adapters/container';
import { AdminNav } from '@/components/admin/AdminNav';
import { Pagination } from '@/components/layout/Pagination';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Link } from '@/i18n/navigation';
import { requirePageSession } from '@/lib/auth/current-session';
import { pageNumberFrom } from '@/lib/validation/page-number';
import { getAuditLog } from '@/services/admin';

const CATEGORIES = ['SECURITY', 'ADMIN', 'DATA'] as const;

/** Lenient: unknown values are ignored rather than failing the page. */
const filtersSchema = z.object({
  category: z.enum(CATEGORIES).optional().catch(undefined),
  action: z.string().trim().max(60).optional().catch(undefined),
  actor: z.string().trim().max(64).optional().catch(undefined),
});

/** FR-13.3 / SR-13: the audit log (kept one year), newest first. */
export default async function AdminAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.audit');
  const format = await getFormatter();
  const raw = await searchParams;
  const filters = filtersSchema.parse(raw);
  const result = await getAuditLog(getContainer(), {
    adminUserId: session.user.id,
    filters: {
      category: filters.category,
      action: filters.action || undefined,
      actorUserId: filters.actor || undefined,
    },
    page: pageNumberFrom(raw.page),
  });
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="audit-category">{t('category')}</Label>
            <NativeSelect id="audit-category" name="category" defaultValue={filters.category ?? ''}>
              <option value="">{t('any')}</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`categories.${category}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="audit-action">{t('action')}</Label>
            <Input id="audit-action" name="action" defaultValue={filters.action ?? ''} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="audit-actor">{t('actor')}</Label>
            <Input id="audit-actor" name="actor" defaultValue={filters.actor ?? ''} />
          </div>
          <Button type="submit">{t('filter')}</Button>
        </form>
      </Card>
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th scope="col" className="py-2">
                  {t('time')}
                </th>
                <th scope="col">{t('category')}</th>
                <th scope="col">{t('action')}</th>
                <th scope="col">{t('actor')}</th>
                <th scope="col">{t('subject')}</th>
                <th scope="col">{t('ip')}</th>
                <th scope="col">{t('details')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((event) => (
                <tr key={event.id} className="border-t align-top">
                  <td className="py-2 whitespace-nowrap">
                    {format.dateTime(event.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td>{t(`categories.${event.category}`)}</td>
                  <td className="font-mono">{event.action}</td>
                  <td>
                    {event.actorUserId ? (
                      <Link href={`/admin/users/${event.actorUserId}`} className="underline">
                        {event.actorName ?? t('unknown')}
                      </Link>
                    ) : (
                      t('system')
                    )}
                  </td>
                  <td>
                    {event.subjectUserId ? (
                      <Link href={`/admin/users/${event.subjectUserId}`} className="underline">
                        {t('view')}
                      </Link>
                    ) : null}
                  </td>
                  <td className="font-mono">{event.ipAddress ?? ''}</td>
                  <td className="font-mono break-all">
                    {event.metadata ? JSON.stringify(event.metadata) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        hrefFor={(page) =>
          `/admin/audit?${new URLSearchParams([...query, ['page', String(page)]])}`
        }
      />
    </PageShell>
  );
}
