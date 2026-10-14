import { describe, expect, it } from 'vitest';
import { isValidStorageKey } from '@/adapters/storage/file-storage';
import { detectImageType } from '@/domain/file-types';
import { basisPointsToPercent, formatCompactCount, formatCount, formatMoney } from '@/lib/format';
import { isValidFileSignature, signFileUrl } from '@/lib/signed-file-url';

const secret = 'file-secret-that-is-long-enough-1234';
const now = new Date('2026-10-13T10:00:00Z');
const inAnHour = new Date('2026-10-13T11:00:00Z');

function paramsOf(url: string) {
  const params = new URL(url, 'https://app.test').searchParams;
  return {
    key: params.get('key') ?? '',
    expires: params.get('expires') ?? '',
    signature: params.get('signature') ?? '',
  };
}

describe('signed file URLs (SR-9)', () => {
  it('accept their own signature until expiry', () => {
    const params = paramsOf(signFileUrl('photos/abcdefghijklmnopqrstuvwx', inAnHour, secret));

    expect(isValidFileSignature(params, secret, now)).toBe(true);
    expect(isValidFileSignature(params, secret, new Date('2026-10-13T11:00:01Z'))).toBe(false);
  });

  it('reject another key, a longer expiry or another secret', () => {
    const params = paramsOf(signFileUrl('photos/abcdefghijklmnopqrstuvwx', inAnHour, secret));

    expect(
      isValidFileSignature({ ...params, key: 'photos/zzzzzzzzzzzzzzzzzzzzzzzz' }, secret, now),
    ).toBe(false);
    expect(isValidFileSignature({ ...params, expires: '9999999999' }, secret, now)).toBe(false);
    expect(isValidFileSignature(params, `${secret}x`, now)).toBe(false);
  });

  it('storage keys cannot escape their folder', () => {
    expect(isValidStorageKey('photos/abcdefghijklmnopqrstuvwx')).toBe(true);
    expect(isValidStorageKey('../etc/passwd')).toBe(false);
    expect(isValidStorageKey('photos/../../secret-file-name-here')).toBe(false);
  });
});

describe('detectImageType (SR-9)', () => {
  it('recognises JPEG, PNG and WebP by their bytes', () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(detectImageType(Buffer.from('RIFF....WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects anything else, whatever its name', () => {
    expect(detectImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });
});

describe('number and money formatting (NFR-8)', () => {
  it('uses Indian digit grouping and lakh/crore compact forms', () => {
    expect(formatCount(1_234_567, 'en', 'IN')).toBe('12,34,567');
    expect(formatCompactCount(120_000, 'en', 'IN')).toBe('1.2L');
  });

  it('formats paise as rupees without decimals for whole amounts', () => {
    expect(formatMoney(450_000, 'INR', 'en', 'IN')).toBe('₹4,500');
    expect(formatMoney(450_050, 'INR', 'en', 'IN')).toBe('₹4,500.50');
  });

  it('shows basis points as a one-decimal percentage', () => {
    expect(basisPointsToPercent(250)).toBe('2.5');
  });
});
