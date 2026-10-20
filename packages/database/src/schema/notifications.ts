import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { NOTIFICATION_TYPE, type NotificationType } from '../enums';

import { createdAt, idColumn, nullableTimestamp } from './_shared';
import { users } from './users';

export { NOTIFICATION_TYPE, type NotificationType };

/**
 * A domain notification for a user. Delivery (push, email, in-app realtime) is
 * a later phase — this table is only the durable record and read state.
 * `data` is a small JSON string of related ids (e.g. `{ "offerId": "ofr_..." }`).
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: idColumn,
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPE }).notNull(),
    data: text('data'),
    /** Readable copy shown in the app. Older rows have none; the client falls back to its own wording. */
    title: text('title'),
    body: text('body'),
    /** Identifies the EVENT, so a retried request cannot notify twice. Unique per recipient. */
    dedupeKey: text('dedupe_key'),
    readAt: nullableTimestamp('read_at'),
    createdAt,
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    uniqueIndex('notifications_dedupe_unique')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);

/**
 * Per-user switches. No row = defaults (everything on). `listingAlerts` gates
 * "a new listing matches something you asked for"; `pushEnabled` gates device
 * pushes only — the in-app feed is always written.
 */
export const notificationPreferences = sqliteTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  pushEnabled: integer('push_enabled', { mode: 'boolean' }).notNull().default(true),
  listingAlerts: integer('listing_alerts', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull().default(0),
});
export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
