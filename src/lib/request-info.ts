import { headers } from 'next/headers';
import { getServerEnv } from '@/config/env';
import type { RequestInfo } from '@/services/context';
import { clientIpFrom } from './client-ip';

/** Client IP, user agent and interface language for the current request. */
export async function getRequestInfo(locale: string): Promise<RequestInfo> {
  const requestHeaders = await headers();
  return {
    ipAddress: clientIpFrom(
      requestHeaders.get('x-forwarded-for'),
      getServerEnv().TRUSTED_PROXY_HOPS,
    ),
    userAgent: requestHeaders.get('user-agent'),
    locale,
  };
}
