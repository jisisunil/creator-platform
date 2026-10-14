import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

const SECTIONS = [
  ['overview', '/admin'],
  ['users', '/admin/users'],
  ['reports', '/admin/reports'],
  ['flags', '/admin/flags'],
  ['disputes', '/admin/disputes'],
] as const;

/** Links between the admin console's sections (FR-13). */
export async function AdminNav() {
  const t = await getTranslations('admin.nav');
  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {SECTIONS.map(([key, href]) => (
        <Link key={key} href={href} className="underline-offset-4 hover:underline">
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
