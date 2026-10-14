import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/config/locales';
import { getCurrentSession } from '@/lib/auth/current-session';
import { handleRoute } from '@/lib/route';
import { exportShortlistCsv } from '@/services/shortlists';

const HEADER_KEYS = [
  'name',
  'profile',
  'city',
  'state',
  'categories',
  'platforms',
  'tier',
  'followers',
  'engagement',
  'score',
  'verified',
  'note',
] as const;

/**
 * FR-6.3: downloads a shortlist as CSV with public fields only. Authentication, brand
 * ownership and the plan's CSV feature are checked by the service; failures map to
 * status codes through the single error mapper.
 */
export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const session = await getCurrentSession();
    if (!session?.isTwoFactorSatisfied || session.user.role !== 'BRAND') {
      return new NextResponse(null, { status: 404 });
    }
    const { id } = await params;
    const requested = (await cookies()).get('NEXT_LOCALE')?.value ?? DEFAULT_LOCALE;
    const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requested)
      ? requested
      : DEFAULT_LOCALE;
    const t = await getTranslations({ locale, namespace: 'brand.csv' });
    const { filename, csv } = await exportShortlistCsv(getContainer(), {
      userId: session.user.id,
      shortlistId: id,
      labels: {
        headers: HEADER_KEYS.map((key) => t(`headers.${key}`)),
        yes: t('yes'),
        no: t('no'),
      },
    });
    // A UTF-8 byte-order mark lets Excel show Hindi and other scripts correctly.
    return new NextResponse(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
