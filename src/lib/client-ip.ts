const MAX_IP_LENGTH = 45; // longest textual IPv6 address

/**
 * The client IP from X-Forwarded-For, trusting only the last `trustedHops` proxies.
 * Each trusted proxy appends the address it saw, so the client is `trustedHops` entries
 * from the end; anything further left could be forged by the client. Returns null when
 * no proxies are trusted or the header is too short.
 */
export function clientIpFrom(forwardedFor: string | null, trustedHops: number): string | null {
  if (trustedHops <= 0 || !forwardedFor) return null;
  const addresses = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = addresses[addresses.length - trustedHops];
  return candidate && candidate.length <= MAX_IP_LENGTH ? candidate : null;
}
