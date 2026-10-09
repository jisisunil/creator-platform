import type { Clock } from '@/adapters/clock';

/** A clock frozen at `isoTime`, for deterministic tests. */
export function fixedClock(isoTime: string): Clock {
  const time = new Date(isoTime);
  return { now: () => new Date(time) };
}
