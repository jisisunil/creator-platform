import { describe, expect, it } from 'vitest';
import { instagramProfileUrl, parseInstagramHandle } from '@/domain/social-handles';

describe('parseInstagramHandle (Q-43)', () => {
  it.each([
    ['asha.cooks', 'asha.cooks'],
    ['@Asha_Cooks', 'asha_cooks'],
    ['  @asha.cooks  ', 'asha.cooks'],
    ['instagram.com/asha.cooks', 'asha.cooks'],
    ['https://www.instagram.com/asha.cooks/?hl=en', 'asha.cooks'],
  ])('reads %s as %s', (input, expected) => {
    expect(parseInstagramHandle(input)).toBe(expected);
  });

  it.each([
    [''],
    ['@'],
    ['asha cooks'],
    ['.asha'],
    ['asha.'],
    ['asha..cooks'],
    ['a'.repeat(31)],
    ['https://www.instagram.com/p/C0abc123/'],
    ['https://evil.example/instagram.com/asha'],
    ['https://instagram.com.evil.example/asha'],
  ])('rejects %s', (input) => {
    expect(parseInstagramHandle(input)).toBeNull();
  });

  it('links to the public profile', () => {
    expect(instagramProfileUrl('@asha.cooks')).toBe('https://www.instagram.com/asha.cooks/');
  });
});
