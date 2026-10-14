import { SIGNED_FILE_URL_TTL_MS } from '@/config/creators';
import { getServerEnv } from '@/config/env';
import { signFileUrl } from './signed-file-url';

/** A signed, expiring URL for a stored file, or null when there is none (SR-9). */
export function fileUrlFor(key: string | null): string | null {
  if (!key) return null;
  return signFileUrl(
    key,
    new Date(Date.now() + SIGNED_FILE_URL_TTL_MS),
    getServerEnv().AUTH_SECRET,
  );
}
