import { headers } from 'next/headers';

/** This request's CSP nonce (set in src/proxy.ts), for third-party scripts we load. */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined;
}
