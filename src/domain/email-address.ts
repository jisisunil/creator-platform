import { DISPOSABLE_EMAIL_DOMAINS, PUBLIC_EMAIL_DOMAINS } from '@/config/email-domains';

/** Canonical form for storage and comparison: trimmed and lower-cased. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The part after the last "@", lower-cased. */
export function emailDomainOf(email: string): string {
  const normalised = normaliseEmail(email);
  return normalised.slice(normalised.lastIndexOf('@') + 1);
}

/** True for throwaway-inbox providers blocked at sign-up (UC-A1). */
export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.has(emailDomainOf(email));
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * UC-B1: the mailbox an email delivers to, to spot repeated sign-ups: "+tags" are dropped
 * everywhere, and Gmail also ignores dots ("r.avi+2@gmail.com" → "ravi@gmail.com").
 */
export function canonicalMailbox(email: string): string {
  const domain = emailDomainOf(email);
  const normalised = normaliseEmail(email);
  const local = normalised.slice(0, normalised.lastIndexOf('@')).split('+')[0] ?? '';
  return GMAIL_DOMAINS.has(domain)
    ? `${local.replaceAll('.', '')}@gmail.com`
    : `${local}@${domain}`;
}

/** The company domain behind an email, or null for free providers like Gmail (UC-B1). */
export function companyDomainOf(email: string): string | null {
  const domain = emailDomainOf(email);
  return PUBLIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}

/**
 * Closed pilot: whether this email may create an account. No list means sign-up is open;
 * otherwise the normalised email must be on it.
 */
export function isInvitedToSignUp(allowlist: readonly string[] | null, email: string): boolean {
  return allowlist === null || allowlist.includes(normaliseEmail(email));
}
