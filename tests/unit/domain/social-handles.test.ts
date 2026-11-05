import { describe, expect, it } from 'vitest';
import {
  instagramProfileUrl,
  parseInstagramHandle,
  parseYouTubeHandle,
  youtubeChannelUrl,
} from '@/domain/social-handles';

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

describe('parseYouTubeHandle (Q-43)', () => {
  it.each([
    ['@AshaCooks', 'ashacooks'],
    ['youtube.com/@asha.cooks', 'asha.cooks'],
    ['https://www.youtube.com/@asha-cooks/videos', 'asha-cooks'],
    ['https://m.youtube.com/@asha_cooks?si=abc', 'asha_cooks'],
  ])('reads %s as %s', (input, expected) => {
    expect(parseYouTubeHandle(input)).toBe(expected);
  });

  it.each([
    ['ashacooks'],
    ['@ab'],
    ['@asha cooks'],
    ['https://www.youtube.com/channel/UC1234567890abcdefghij'],
    ['https://www.youtube.com/c/AshaCooks'],
    ['https://youtube.com.evil.example/@asha'],
  ])('rejects %s', (input) => {
    expect(parseYouTubeHandle(input)).toBeNull();
  });

  it('links to the channel', () => {
    expect(youtubeChannelUrl('@ashacooks')).toBe('https://www.youtube.com/@ashacooks');
  });
});
