/** Chat rules (FR-8, UC-R3). Pure: no I/O. */
import { type ContactDetailKind, findContactDetails } from './content-safety';

export type CollabSide = 'BRAND' | 'CREATOR';

/** The other side of a collaboration. */
export function otherSide(side: CollabSide): CollabSide {
  return side === 'BRAND' ? 'CREATOR' : 'BRAND';
}

/**
 * FR-8.2: a message is "early" while the chat has fewer than `earlyMessageCount` messages
 * or is younger than `earlyWindowMs`, whichever lasts longer.
 */
export function isEarlyMessage(
  chat: { readonly messageCount: number; readonly startedAt: Date },
  now: Date,
  limits: { readonly earlyMessageCount: number; readonly earlyWindowMs: number },
): boolean {
  return (
    chat.messageCount < limits.earlyMessageCount ||
    now.getTime() - chat.startedAt.getTime() < limits.earlyWindowMs
  );
}

/** FR-8.2: contact details to flag with a safety note; only early messages are checked. */
export function contactFlagsFor(body: string, isEarly: boolean): ContactDetailKind[] {
  return isEarly ? findContactDetails(body) : [];
}

/**
 * SR-9: a safe display name for an uploaded file: no folders, control or markup
 * characters, a bounded length, and a fallback when nothing usable is left.
 */
export function safeFileName(name: string, maxLength: number): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/^[.\s]+/, '')
    .trim();
  if (cleaned.length <= maxLength) return cleaned || 'file';
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, maxLength - extension.length) + extension;
}
