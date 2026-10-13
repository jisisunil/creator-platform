import { describe, expect, it } from 'vitest';
import { findPasswordProblem } from '@/domain/password-policy';

describe('findPasswordProblem (SR-1)', () => {
  it('requires at least 10 characters', () => {
    expect(findPasswordProblem('short-pw1', 'a@b.in')).toBe('tooShort');
    expect(findPasswordProblem('long-enough', 'a@b.in')).toBeNull();
  });

  it('caps length at 128 characters', () => {
    expect(findPasswordProblem('x'.repeat(129), 'a@b.in')).toBe('tooLong');
  });

  it('rejects passwords containing the email name', () => {
    expect(findPasswordProblem('Priyanka-2026!', 'priyanka@example.in')).toBe('containsEmail');
  });

  it('ignores very short email names, which would match by accident', () => {
    expect(findPasswordProblem('abcdefghijk', 'ab@example.in')).toBeNull();
  });
});
