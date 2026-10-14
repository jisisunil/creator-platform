import type { Prisma } from '@/generated/prisma/client';
import type { DbClient } from './db-client';

export type NotificationCategory =
  'REQUESTS' | 'MESSAGES' | 'DEALS' | 'RATINGS' | 'ACCOUNT' | 'PLAN';
export type NotificationChannel = 'IN_APP' | 'EMAIL';

export interface NotificationRecord {
  readonly id: string;
  readonly kind: string;
  readonly params: Readonly<Record<string, string>>;
  readonly path: string;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface PreferenceRecord {
  readonly category: NotificationCategory;
  readonly channel: NotificationChannel;
  readonly isEnabled: boolean;
}

/** Params are stored as written by the notifications service: string values only. */
function paramsFrom(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;

/** In-app notifications and notification preferences (FR-12). */
export function createNotificationRepository(db: DbClient) {
  return {
    async create(notification: {
      userId: string;
      category: NotificationCategory;
      kind: string;
      params: Readonly<Record<string, string>>;
      path: string;
      createdAt: Date;
    }): Promise<void> {
      await db.notification.create({
        data: { ...notification, params: { ...notification.params } },
      });
    },

    async list(
      userId: string,
      page: { offset: number; limit: number },
    ): Promise<{ items: NotificationRecord[]; total: number }> {
      const [rows, total] = await Promise.all([
        db.notification.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: page.offset,
          take: page.limit,
          select: { id: true, kind: true, params: true, path: true, readAt: true, createdAt: true },
        }),
        db.notification.count({ where: { userId } }),
      ]);
      return { items: rows.map((row) => ({ ...row, params: paramsFrom(row.params) })), total };
    },

    countUnread: (userId: string): Promise<number> =>
      db.notification.count({ where: { userId, readAt: null } }),

    async markAllRead(userId: string, at: Date): Promise<void> {
      await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: at } });
    },

    /** PR-9: notifications are kept for a limited time. */
    async deleteCreatedBefore(cutoff: Date): Promise<number> {
      const result = await db.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return result.count;
    },

    listPreferences: (userId: string): Promise<PreferenceRecord[]> =>
      db.notificationPreference.findMany({
        where: { userId },
        select: { category: true, channel: true, isEnabled: true },
      }),

    async setPreference(userId: string, preference: PreferenceRecord): Promise<void> {
      const { category, channel, isEnabled } = preference;
      await db.notificationPreference.upsert({
        where: { userId_category_channel: { userId, category, channel } },
        create: { userId, category, channel, isEnabled },
        update: { isEnabled },
      });
    },
  };
}
