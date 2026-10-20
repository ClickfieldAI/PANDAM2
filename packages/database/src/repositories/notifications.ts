import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { newId } from '../id';
import {
  type NotificationPreferencesRow,
  type NotificationRow,
  type NotificationType,
  notificationPreferences,
  notifications,
} from '../schema/notifications';

import { type Database, firstOrNull, now } from './helpers';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  /** Small structured context (related ids). Serialised to JSON. */
  data?: Record<string, string> | null;
  title?: string | null;
  body?: string | null;
  /** Identifies the event; a second insert with the same key for the same user is ignored. */
  dedupeKey?: string | null;
}

export interface NotificationCursor {
  createdAt: number;
  id: string;
}

export const DEFAULT_PREFERENCES = { pushEnabled: true, listingAlerts: true } as const;

export function notificationsRepository(db: Database) {
  return {
    /**
     * Insert a notification. Returns null when an identical event (same
     * recipient + dedupe key) was already recorded — one atomic statement, so
     * two concurrent retries cannot both succeed.
     */
    async create(input: CreateNotificationInput): Promise<NotificationRow | null> {
      const rows = await db
        .insert(notifications)
        .values({
          id: newId('notification'),
          userId: input.userId,
          type: input.type,
          data: input.data ? JSON.stringify(input.data) : null,
          title: input.title ?? null,
          body: input.body ?? null,
          dedupeKey: input.dedupeKey ?? null,
        })
        .onConflictDoNothing()
        .returning();
      return firstOrNull(rows);
    },

    async findById(id: string): Promise<NotificationRow | null> {
      const rows = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
      return firstOrNull(rows);
    },

    /** One page, newest first. Bounded: callers pass a limit (the route caps it). */
    async listPage(
      userId: string,
      opts: { unreadOnly?: boolean; limit: number; before?: NotificationCursor },
    ): Promise<NotificationRow[]> {
      const where = [
        eq(notifications.userId, userId),
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
        opts.before
          ? or(
              lt(notifications.createdAt, opts.before.createdAt),
              and(
                eq(notifications.createdAt, opts.before.createdAt),
                lt(notifications.id, opts.before.id),
              ),
            )
          : undefined,
      ].filter((w) => w !== undefined);
      return db
        .select()
        .from(notifications)
        .where(and(...where))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(opts.limit);
    },

    /** Every notification (used by the need-alert de-duplication and tests). */
    async listForUser(userId: string, unreadOnly = false): Promise<NotificationRow[]> {
      const where = unreadOnly
        ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
        : eq(notifications.userId, userId);
      return db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(500);
    },

    async unreadCount(userId: string): Promise<number> {
      const rows = await db
        .select({ n: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      return Number(rows[0]?.n ?? 0);
    },

    /** Mark ONE of THIS user's notifications read. Null if it is not theirs / not there. */
    async markReadForUser(id: string, userId: string): Promise<NotificationRow | null> {
      const owned = firstOrNull(
        await db
          .select()
          .from(notifications)
          .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
          .limit(1),
      );
      if (!owned) return null;
      if (owned.readAt !== null) return owned; // idempotent: keep the first read time
      const rows = await db
        .update(notifications)
        .set({ readAt: now() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        )
        .returning();
      return firstOrNull(rows) ?? owned;
    },

    /** One statement for the whole feed. Returns how many were unread. */
    async markAllRead(userId: string): Promise<number> {
      const rows = await db
        .update(notifications)
        .set({ readAt: now() })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .returning({ id: notifications.id });
      return rows.length;
    },

    async getPreferences(
      userId: string,
    ): Promise<Omit<NotificationPreferencesRow, 'userId' | 'updatedAt'>> {
      const row = firstOrNull(
        await db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, userId))
          .limit(1),
      );
      return row
        ? { pushEnabled: row.pushEnabled, listingAlerts: row.listingAlerts }
        : { ...DEFAULT_PREFERENCES };
    },

    async setPreferences(
      userId: string,
      patch: { pushEnabled?: boolean; listingAlerts?: boolean },
    ): Promise<{ pushEnabled: boolean; listingAlerts: boolean }> {
      const current = await this.getPreferences(userId);
      const next = { ...current, ...patch };
      await db
        .insert(notificationPreferences)
        .values({ userId, ...next, updatedAt: now() })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { ...next, updatedAt: now() },
        });
      return next;
    },
  };
}

export type NotificationsRepository = ReturnType<typeof notificationsRepository>;
