export interface NoticeVersion {
  readonly version: string;
  readonly publishedAt: Date;
  readonly isMaterialChange: boolean;
}

/**
 * PRV-8: a user must agree again when any notice published after the one they accepted
 * changed purposes materially. Unknown or missing acceptance always needs consent.
 */
export function needsPrivacyReconsent(
  acceptedVersion: string | null,
  notices: readonly NoticeVersion[],
): boolean {
  if (acceptedVersion === null) return true;
  const accepted = notices.find((notice) => notice.version === acceptedVersion);
  if (!accepted) return true;
  return notices.some(
    (notice) =>
      notice.isMaterialChange && notice.publishedAt.getTime() > accepted.publishedAt.getTime(),
  );
}
