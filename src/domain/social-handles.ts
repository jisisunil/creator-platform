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

/** YouTube handles: 3–30 letters, digits, underscores, hyphens and dots (YouTube's rules). */
const YOUTUBE_HANDLE = /^[a-z0-9._-]{3,30}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/**
 * Turns "@ashacooks" or a channel link like youtube.com/@ashacooks into the lowercase
 * handle, or null. Old-style /channel/ and /c/ links are refused: the @handle is what
 * brands can look up.
 */
export function parseYouTubeHandle(input: string): string | null {
  const trimmed = input.trim();
  let candidate = trimmed;
  if (/youtube\.com/i.test(trimmed)) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      // Channel pages may have a tab after the handle (/@name/videos).
      const handleSegment = segments[0] ?? '';
      if (!handleSegment.startsWith('@')) return null;
      candidate = handleSegment;
    } catch {
      // Not a parseable link: treat as invalid input, not an error.
      return null;
    }
  } else if (!candidate.startsWith('@')) {
    return null;
  }
  const handle = candidate.slice(1).toLowerCase();
  return YOUTUBE_HANDLE.test(handle) ? handle : null;
}

/** The public channel link brands can open to check a self-reported channel themselves. */
export function youtubeChannelUrl(handle: string): string {
  return `https://www.youtube.com/@${encodeURIComponent(handle.replace(/^@/, ''))}`;
}

/** How each platform's self-reported handle is read and linked (Q-43). */
export const SELF_REPORT_HANDLES = {
  INSTAGRAM: { parse: parseInstagramHandle, profileUrl: instagramProfileUrl },
  YOUTUBE: { parse: parseYouTubeHandle, profileUrl: youtubeChannelUrl },
} as const;
