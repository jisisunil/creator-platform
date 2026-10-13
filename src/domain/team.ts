export interface SeatUsage {
  readonly memberCount: number;
  readonly pendingInviteCount: number;
  readonly seatLimit: number;
}

/**
 * UC-A6 / UC-B3: a new invite needs a free seat, counting pending invites. After a
 * downgrade, existing members stay but no new invites are allowed until seats free up.
 */
export function hasFreeSeat(usage: SeatUsage): boolean {
  return usage.memberCount + usage.pendingInviteCount < usage.seatLimit;
}
