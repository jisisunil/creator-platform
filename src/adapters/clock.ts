/** Source of the current time. Injected so tests are deterministic (CLAUDE.md §11). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
