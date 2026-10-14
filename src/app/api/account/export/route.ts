import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { DEFAULT_LOCALE } from '@/config/locales';
import { getCurrentSession } from '@/lib/auth/current-session';
import { getRequestInfo } from '@/lib/request-info';
import { handleRoute } from '@/lib/route';
import { exportMyData } from '@/services/privacy';

/**
 * PRV-2: downloads all of the signed-in user's data as JSON. The service rate-limits and
 * logs each export; nothing is cached on the way.
 */
export function GET(request: Request): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const session = await getCurrentSession();
    if (!session?.isTwoFactorSatisfied) return new NextResponse(null, { status: 404 });
    const { filename, json } = await exportMyData(getContainer(), {
      userId: session.user.id,
      request: await getRequestInfo(DEFAULT_LOCALE),
    });
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
