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
import { searchUsers } from '@/services/admin';

const ROLES = ['CREATOR', 'BRAND', 'ADMIN'] as const;
const STATUSES = [
  'ACTIVE',
  'PENDING_VERIFICATION',
  'SUSPENDED',
  'DELETION_PENDING',
  'ANONYMISED',
] as const;

/** Lenient: unknown values are ignored rather than failing the page. */
const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
});

/** FR-13.1: find users by name or email, with role and status filters. */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requirePageSession(locale, { roles: ['ADMIN'] });
  const t = await getTranslations('admin.users');
  const format = await getFormatter();
  const raw = await searchParams;
  const filters = filtersSchema.parse(raw);
  const result = await searchUsers(getContainer(), {
    adminUserId: session.user.id,
    filters: { query: filters.q || undefined, role: filters.role, status: filters.status },
    page: pageNumberFrom(raw.page),
  });
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );

  return (
    <PageShell title={t('title')} intro={<AdminNav />} wide>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-q">{t('search')}</Label>
            <Input id="admin-q" name="q" defaultValue={filters.q ?? ''} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-role">{t('role')}</Label>
            <NativeSelect id="admin-role" name="role" defaultValue={filters.role ?? ''}>
              <option value="">{t('any')}</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="admin-status">{t('status')}</Label>
            <NativeSelect id="admin-status" name="status" defaultValue={filters.status ?? ''}>
              <option value="">{t('any')}</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`statuses.${status}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit">{t('find')}</Button>
        </form>
      </Card>
      {result.items.length === 0 ? (
        <Card>
          <p className="text-muted-foreground text-sm">{t('none')}</p>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-2">
                  {t('name')}
                </th>
                <th scope="col">{t('email')}</th>
                <th scope="col">{t('role')}</th>
                <th scope="col">{t('status')}</th>
                <th scope="col">{t('joined')}</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="py-2">
                    <Link href={`/admin/users/${user.id}`} className="underline">
                      {user.name}
                    </Link>
                  </td>
                  <td className="break-all">{user.email}</td>
                  <td>{t(`roles.${user.role}`)}</td>
                  <td>{t(`statuses.${user.status}`)}</td>
                  <td>{format.dateTime(user.createdAt, { dateStyle: 'medium' })}</td>
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
          `/admin/users?${new URLSearchParams([...query, ['page', String(page)]])}`
        }
      />
    </PageShell>
  );
}
