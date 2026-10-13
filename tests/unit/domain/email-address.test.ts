import { describe, expect, it } from 'vitest';
import {
  companyDomainOf,
  emailDomainOf,
  isDisposableEmail,
  normaliseEmail,
} from '@/domain/email-address';

describe('email addresses', () => {
  it('normalises case and surrounding spaces', () => {
    expect(normaliseEmail('  Priya.Sharma@Example.COM ')).toBe('priya.sharma@example.com');
  });

  it('extracts the domain even with stray spaces', () => {
    expect(emailDomainOf('  a@Sub.Example.in ')).toBe('sub.example.in');
  });

  it('UC-A1 flags disposable email providers', () => {
    expect(isDisposableEmail('someone@mailinator.com')).toBe(true);
    expect(isDisposableEmail('someone@company.in')).toBe(false);
  });

  it('UC-B1 treats free mail providers as having no company domain', () => {
    expect(companyDomainOf('owner@gmail.com')).toBeNull();
    expect(companyDomainOf('owner@spiceco.in')).toBe('spiceco.in');
  });
});
