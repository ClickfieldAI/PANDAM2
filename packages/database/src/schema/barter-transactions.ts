import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { BARTER_TRANSACTION_STATUS, type BarterTransactionStatus } from '../enums';

import { createdAt, idColumn, nullableTimestamp, updatedAt } from './_shared';
import { offers } from './offers';
import { users } from './users';

/**
 * Barter transaction lifecycle. This is NOT a payment: there is no amount,
 * currency, fee or balance anywhere in this table — a good/service is exchanged
 * directly for another. The `barter_` naming is deliberate.
 *
 *   created ─▶ in_progress ─▶ completed
 *      │            │
 *      └────────────┴─▶ cancelled
 *                   └─▶ disputed ─▶ (resolved back to in_progress | cancelled)
 */
export { BARTER_TRANSACTION_STATUS, type BarterTransactionStatus };

export const barterTransactions = sqliteTable(
  'barter_transactions',
  {
    id: idColumn,
    /** The accepted offer this barter realises. One transaction per offer. */
    offerId: text('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'restrict' }),
    initiatedByUserId: text('initiated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    counterpartyUserId: text('counterparty_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status', { enum: BARTER_TRANSACTION_STATUS }).notNull().default('created'),
    /**
     * Each party must confirm the exchange happened before it is `completed`.
     * One party alone can never complete a trade.
     */
    initiatorConfirmedAt: nullableTimestamp('initiator_confirmed_at'),
    counterpartyConfirmedAt: nullableTimestamp('counterparty_confirmed_at'),
    completedAt: nullableTimestamp('completed_at'),
    cancelledAt: nullableTimestamp('cancelled_at'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('barter_transactions_offer_unique').on(t.offerId),
    check(
      'barter_transactions_distinct_parties',
      sql`${t.initiatedByUserId} <> ${t.counterpartyUserId}`,
    ),
    index('barter_transactions_initiator_idx').on(t.initiatedByUserId, t.status),
    index('barter_transactions_counterparty_idx').on(t.counterpartyUserId, t.status),
  ],
);

export type BarterTransactionRow = typeof barterTransactions.$inferSelect;
export type NewBarterTransactionRow = typeof barterTransactions.$inferInsert;
