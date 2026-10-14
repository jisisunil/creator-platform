import { describe, expect, it } from 'vitest';
import { isOutsideWorkingHours } from '@/domain/monitoring';

const HOURS = { startHour: 9, endHour: 19, timeZone: 'Asia/Kolkata' };

describe('admin working hours (SR-14)', () => {
  it('uses India time: 08:30 and 19:30 IST are outside, 10:30 IST is inside', () => {
    expect(isOutsideWorkingHours(new Date('2026-10-15T03:00:00Z'), HOURS)).toBe(true);
    expect(isOutsideWorkingHours(new Date('2026-10-15T05:00:00Z'), HOURS)).toBe(false);
    expect(isOutsideWorkingHours(new Date('2026-10-15T14:00:00Z'), HOURS)).toBe(true);
  });

  it('counts the end hour as outside and the start hour as inside', () => {
    expect(isOutsideWorkingHours(new Date('2026-10-15T03:30:00Z'), HOURS)).toBe(false); // 09:00
    expect(isOutsideWorkingHours(new Date('2026-10-15T13:30:00Z'), HOURS)).toBe(true); // 19:00
  });
});
