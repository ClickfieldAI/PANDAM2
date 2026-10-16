import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn } from './_shared';
import { listings } from './listings';
import { users } from './users';

/**
 * SIMULATED sale + platform fee, recorded for the client demo.
 *
 * Nothing here is a real payment: no Razorpay call is ever made, no money
 * moves, and `is_demo` is pinned to 1 by a CHECK constraint so a row can never
 * be mistaken for (or promoted to) a real transaction. Real purchases live
 * only in `payments`; this table is kept separate so a future Razorpay
 * integration can add a fee to `payments` without untangling demo data.
 *
 * Amounts are minor units (paise), exact integers, like `payments.amount`.
 * `fee_schedule` snapshots the tier schedule used so a later change to the
 * configured tiers never rewrites history.
 */
export const demoFeeTransactions = sqliteTable(
  'demo_fee_transactions',
  {
    id: idColumn,
    /** The signed-in user who ran the simulation. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Set when the demo used an existing sale listing; NULL for a typed amount. */
    listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    listingTitle: text('listing_title'),
    currency: text('currency').notNull().default('INR'),
    /** Sale amount the buyer pays (paise). */
    amount: integer('amount').notNull(),
    /** Platform fee, deducted from the seller's proceeds (paise). */
    feeAmount: integer('fee_amount').notNull(),
    /** Seller's net proceeds = amount - fee (paise). */
    netAmount: integer('net_amount').notNull(),
    tierLabel: text('tier_label').notNull(),
    /** JSON snapshot of the fee schedule in force when this was simulated. */
    feeSchedule: text('fee_schedule').notNull(),
    /** Client-generated; (user, key) is unique so a retry never double-counts. */
    idempotencyKey: text('idempotency_key').notNull(),
    isDemo: integer('is_demo').notNull().default(1),
    status: text('status', { enum: ['simulated_paid'] })
      .notNull()
      .default('simulated_paid'),
    createdAt,
  },
  (t) => [
    uniqueIndex('demo_fee_tx_idem_unique').on(t.userId, t.idempotencyKey),
    check('demo_fee_tx_is_demo', sql`${t.isDemo} = 1`),
    check('demo_fee_tx_amount_positive', sql`${t.amount} > 0`),
    check('demo_fee_tx_fee_valid', sql`${t.feeAmount} >= 0 AND ${t.feeAmount} <= ${t.amount}`),
    check('demo_fee_tx_net_consistent', sql`${t.netAmount} = ${t.amount} - ${t.feeAmount}`),
    index('demo_fee_tx_created_idx').on(t.createdAt),
  ],
);

export type DemoFeeTransactionRow = typeof demoFeeTransactions.$inferSelect;
export type NewDemoFeeTransactionRow = typeof demoFeeTransactions.$inferInsert;
