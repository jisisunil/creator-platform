import { describe, expect, it } from 'vitest';
import { contactFlagsFor, isEarlyMessage, otherSide, safeFileName } from '@/domain/chat';
import { detectAttachmentType } from '@/domain/file-types';

const LIMITS = { earlyMessageCount: 10, earlyWindowMs: 48 * 3_600_000 };
const STARTED = new Date('2026-10-09T10:00:00Z');
const hoursLater = (hours: number) => new Date(STARTED.getTime() + hours * 3_600_000);

describe('early messages (FR-8.2)', () => {
  it('is early during the first 10 messages, even after 48 hours', () => {
    expect(isEarlyMessage({ messageCount: 9, startedAt: STARTED }, hoursLater(100), LIMITS)).toBe(
      true,
    );
  });

  it('is early during the first 48 hours, even after 10 messages', () => {
    expect(isEarlyMessage({ messageCount: 40, startedAt: STARTED }, hoursLater(47), LIMITS)).toBe(
      true,
    );
  });

  it('is no longer early after both 10 messages and 48 hours', () => {
    expect(isEarlyMessage({ messageCount: 10, startedAt: STARTED }, hoursLater(48), LIMITS)).toBe(
      false,
    );
  });

  it('flags phone numbers, emails and links only in early messages', () => {
    const body = 'Call me on 98765 43210 or mail asha@example.in';

    expect(contactFlagsFor(body, true)).toEqual(['EMAIL', 'PHONE']);
    expect(contactFlagsFor(body, false)).toEqual([]);
    expect(contactFlagsFor('See www.example.com/portfolio', true)).toEqual(['LINK']);
    expect(contactFlagsFor('Sounds good, see you Monday', true)).toEqual([]);
  });

  it('knows the other side', () => {
    expect(otherSide('BRAND')).toBe('CREATOR');
    expect(otherSide('CREATOR')).toBe('BRAND');
  });
});

describe('attachments (SR-9)', () => {
  it('accepts PDFs and images by their bytes, not their names', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n...');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

    expect(detectAttachmentType(pdf)).toBe('application/pdf');
    expect(detectAttachmentType(png)).toBe('image/png');
    expect(detectAttachmentType(exe)).toBeNull();
  });

  it('cleans file names of folders and markup and keeps the extension when shortening', () => {
    expect(safeFileName('C:\\Users\\asha\\Brief <final>.pdf', 100)).toBe('Brief _final_.pdf');
    expect(safeFileName('../../etc/passwd', 100)).toBe('passwd');
    expect(safeFileName('...', 100)).toBe('file');
    expect(safeFileName(`${'a'.repeat(200)}.pdf`, 20)).toBe(`${'a'.repeat(16)}.pdf`);
  });
});
