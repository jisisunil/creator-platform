/**
 * NFR-1 / NFR-6: the translation namespaces client components use. Only these are sent to
 * the browser; sending every string (admin screens, email templates…) made each page's HTML
 * three times larger and slowed the first paint on phones. A unit test checks that every
 * useTranslations('…') in src/ is covered here.
 */
export const CLIENT_MESSAGE_NAMESPACES = [
  'admin.overview',
  'admin.plans',
  'admin.users',
  'auth',
  'brand.savedSearches',
  'brand.search',
  'brand.shortlists',
  'chat',
  'common',
  'creator.accounts',
  'creator.analytics.flags',
  'creator.profile',
  'deals.actions',
  'deals.summary',
  'deals.terms',
  'deliverables',
  'errors',
  'fieldErrors',
  'home',
  'industries',
  'plans',
  'ratings',
  'requests.block',
  'requests.detail',
  'requests.form',
  'requests.usageRights',
  'settings.changeEmail',
  'settings.changePassword',
  'settings.data',
  'settings.delete',
  'settings.notifications',
  'settings.privacy',
  'team',
] as const;

type Messages = Readonly<Record<string, unknown>>;

function isMessages(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The value at one dotted path, wrapped in its parent keys ({} when missing). */
function pickPath(source: Messages, keys: readonly string[]): Messages {
  const [head, ...rest] = keys;
  if (head === undefined || !(head in source)) return {};
  const value = source[head];
  if (rest.length === 0) return { [head]: value };
  return isMessages(value) ? { [head]: pickPath(value, rest) } : {};
}

function mergeMessages(first: Messages, second: Messages): Messages {
  const merged: Record<string, unknown> = { ...first };
  for (const [key, value] of Object.entries(second)) {
    const existing = merged[key];
    merged[key] =
      isMessages(existing) && isMessages(value) ? mergeMessages(existing, value) : value;
  }
  return merged;
}

/** The subset of `messages` under the given dotted paths, keeping the nesting. */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  return paths.reduce<Messages>(
    (picked, path) => mergeMessages(picked, pickPath(messages, path.split('.'))),
    {},
  );
}
