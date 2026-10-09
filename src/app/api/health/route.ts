import { NextResponse } from 'next/server';
import { getContainer } from '@/adapters/container';
import { handleRoute } from '@/lib/route';
import { checkHealth } from '@/services/system';

export const dynamic = 'force-dynamic';

const SERVICE_UNAVAILABLE = 503;

export function GET(request: Request): Promise<NextResponse> {
  return handleRoute(request, async () => {
    const status = await checkHealth(getContainer());
    return NextResponse.json(status, { status: status.isHealthy ? 200 : SERVICE_UNAVAILABLE });
  });
}
