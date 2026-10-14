/** Public creator fields that may go into an embedding (ADR-006). No contact or private data. */
export interface CreatorForProfileText {
  readonly displayName: string;
  readonly bio: string;
  readonly city: string;
  readonly stateName: string;
  readonly countryCode: string;
  readonly languageNames: readonly string[];
  readonly categoryNames: readonly string[];
  readonly platforms: readonly string[];
  readonly tier: string | null;
}

/**
 * The text a future embedding model would read for "similar creators" and AI search.
 * Deterministic and built only from public profile fields, so re-embedding is reproducible.
 */
export function buildCreatorProfileText(creator: CreatorForProfileText): string {
  const location = [creator.city, creator.stateName, creator.countryCode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
  const lines = [
    `Creator: ${creator.displayName.trim()}`,
    location && `Location: ${location}`,
    creator.languageNames.length > 0 && `Languages: ${creator.languageNames.join(', ')}`,
    creator.categoryNames.length > 0 && `Categories: ${creator.categoryNames.join(', ')}`,
    creator.platforms.length > 0 && `Platforms: ${creator.platforms.join(', ')}`,
    creator.tier && `Tier: ${creator.tier.toLowerCase()}`,
    creator.bio.trim() && `About: ${creator.bio.trim()}`,
  ];
  return lines.filter(Boolean).join('\n');
}
