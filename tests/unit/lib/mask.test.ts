import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone } from '@/lib/mask';

describe('log masking (SR-13)', () => {
  it('keeps only the first letter and domain of an email', () => {
    expect(maskEmail('priya.sharma@example.com')).toBe('p***@example.com');
  });

  it('fully masks malformed emails', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });

  it('keeps only the last two digits of a phone number', () => {
    expect(maskPhone('+91 98765 43210')).toBe('***10');
    expect(maskPhone('7')).toBe('***');
  });
});
