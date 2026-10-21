import { index, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn, nullableTimestamp } from './_shared';
import { conversations } from './conversations';
import { users } from './users';

/**
 * A message inside a conversation. `editedAt` / `deletedAt` are soft markers so
 * history is preserved. Realtime delivery (WebSockets / Durable Objects) is a
 * later phase; this is storage only — the app polls for new messages.
 */
export const messages = sqliteTable(
  'messages',
  {
    id: idColumn,
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Caption text — empty when the message is an image with no caption. */
    body: text('body').notNull(),
    /** R2 object key for an attached photo, or `null` for a text-only message. */
    imageKey: text('image_key'),
    /** R2 object key for an attached video (its `imageKey`, if any, is the thumbnail). */
    videoKey: text('video_key'),
    /** A shared location: WGS84 degrees, plus an optional human-readable place name. */
    latitude: real('latitude'),
    longitude: real('longitude'),
    placeName: text('place_name'),
    /**
     * Chosen by the sender's app for each message it composes. (sender, clientId)
     * is unique, so re-sending the same message (a retry after a lost response,
     * a restart with an unsent outbox) can never store it twice.
     */
    clientId: text('client_id'),
    createdAt,
    editedAt: nullableTimestamp('edited_at'),
    deletedAt: nullableTimestamp('deleted_at'),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_client_id_unique').on(t.senderId, t.clientId),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
