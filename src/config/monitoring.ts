/** SR-14 monitoring thresholds, checked every 15 minutes. */
export const MONITORING = {
  windowMs: 15 * 60_000,
  /** Failed sign-ins across the platform in one window that suggest credential stuffing. */
  failedLoginSpike: 50,
  /** Data exports in one window that are unusual for a platform this size. */
  exportVolume: 20,
  /** Admin actions outside these hours (India time) raise an alert. */
  workingHours: { startHour: 9, endHour: 19, timeZone: 'Asia/Kolkata' },
  /** PR-5: warn when open data requests are this close to their due date. */
  dataRequestWarningMs: 5 * 86_400_000,
} as const;
