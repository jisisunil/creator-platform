/** Instagram usernames: 1–30 letters, digits, dots and underscores (Instagram's own rules). */
const INSTAGRAM_USERNAME = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/;
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

/**
 * Turns what a creator typed ("@asha.cooks", "asha.cooks", or a profile link) into the
 * lowercase Instagram username, or null when it isn't a valid one.
 */
export function parseInstagramHandle(input: string): string | null {
  const trimmed = input.trim();
  let candidate = trimmed.replace(/^@/, '');
  if (/instagram\.com/i.test(trimmed)) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1) return null;
      candidate = segments[0] ?? '';
    } catch {
      // Not a parseable link: treat as invalid input, not an error.
      return null;
    }
  }
  const username = candidate.toLowerCase();
  return INSTAGRAM_USERNAME.test(username) ? username : null;
}

/** The public profile link brands can open to check a self-reported account themselves. */
export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username.replace(/^@/, ''))}/`;
}
