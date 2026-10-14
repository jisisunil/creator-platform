/** Monitoring rules (SR-14). Pure: no I/O. */

export interface WorkingHours {
  /** First working hour, 0-23, in `timeZone`. */
  readonly startHour: number;
  /** First hour after work, 0-23, in `timeZone`. */
  readonly endHour: number;
  readonly timeZone: string;
}

/** The hour of the day (0-23) at `date` in the given time zone. */
function hourIn(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone })
    .formatToParts(date)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0);
}

/** SR-14: whether an admin action at `date` falls outside working hours. */
export function isOutsideWorkingHours(date: Date, hours: WorkingHours): boolean {
  const hour = hourIn(date, hours.timeZone);
  return hour < hours.startHour || hour >= hours.endHour;
}
