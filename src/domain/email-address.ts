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

/** The company domain behind an email, or null for free providers like Gmail (UC-B1). */
export function companyDomainOf(email: string): string | null {
  const domain = emailDomainOf(email);
  return PUBLIC_EMAIL_DOMAINS.has(domain) ? null : domain;
}
