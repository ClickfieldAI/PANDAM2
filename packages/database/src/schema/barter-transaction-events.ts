import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn } from './_shared';
import { barterTransactions } from './barter-transactions';
import { users } from './users';

export const BARTER_EVENT_TYPE = ['accepted', 'confirmed', 'completed', 'cancelled'] as const;
export type BarterEventType = (typeof BARTER_EVENT_TYPE)[number];

/**
 * Append-only history of a barter transaction: who did what, and when. Rows
 * are written in the same database batch as the state change they describe,
 * and the unique index on (transaction, type, actor) makes every event
 * idempotent — a retried request can never record the same action twice.
 */
export const barterTransactionEvents = sqliteTable(
  'barter_transaction_events',
  {
    id: idColumn,
    transactionId: text('transaction_id')
      .notNull()
      .references(() => barterTransactions.id, { onDelete: 'cascade' }),
    /** The user who acted; NULL only for system actions. */
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type', { enum: BARTER_EVENT_TYPE }).notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex('barter_events_unique').on(t.transactionId, t.type, t.actorUserId),
    index('barter_events_tx_idx').on(t.transactionId, t.createdAt),
  ],
);

export type BarterTransactionEventRow = typeof barterTransactionEvents.$inferSelect;
export type NewBarterTransactionEventRow = typeof barterTransactionEvents.$inferInsert;
