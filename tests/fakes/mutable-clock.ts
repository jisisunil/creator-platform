import type { Clock } from '@/adapters/clock';

export interface MutableClock extends Clock {
  advance(milliseconds: number): void;
}

/** A clock tests can move forward, e.g. past a lockout or an expiry. */
export function mutableClock(isoTime: string): MutableClock {
  let current = new Date(isoTime).getTime();
  return {
    now: () => new Date(current),
    advance(milliseconds) {
      current += milliseconds;
    },
  };
}
