import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { TRANSACTION_TYPE, type TransactionType } from '../enums';

import { ITEM_TYPE, PUBLICATION_STATUS, createdAt, idColumn, updatedAt } from './_shared';
import { categories } from './categories';
import { users } from './users';

export { TRANSACTION_TYPE, type TransactionType };

/**
 * "I HAVE" — something a user offers: a product, a service or a skill.
 * Matching keys off (`categoryId`, `type`); `title`/`description` are
 * human-facing only.
 *
 * `transactionType` decides how it may be acquired:
 *  - `barter` (default): the V1 model — reciprocal matching + offers, no money.
 *  - `sale` / `both`: also (or only) buyable for real money via a Razorpay
 *    Payment Link (see the `payments` table). `priceAmount` is REQUIRED for
 *    these two and is always the minor currency unit (paise for INR) so it is
 *    an exact integer — never a float.
 * A `sale`-only listing is excluded from reciprocal matching (nothing to trade
 * back), enforced in the discovery/matching repositories, not just here.
 */
export const listings = sqliteTable(
  'listings',
  {
    id: idColumn,
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ITEM_TYPE }).notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: PUBLICATION_STATUS }).notNull().default('draft'),
    transactionType: text('transaction_type', { enum: TRANSACTION_TYPE })
      .notNull()
      .default('barter'),
    /** Minor currency unit (paise for INR). NULL when `transactionType` is `barter`. */
    priceAmount: integer('price_amount'),
    /**
     * Set when the owner deleted a listing that has trade history. The row is
     * kept (past offers and trades still need its title) but is hidden from
     * every list. A listing with no history is hard-deleted instead.
     */
    deletedAt: integer('deleted_at'),
    /** Set when staff removed this item; the owner cannot re-publish while set. */
    moderationRemovedAt: integer('moderation_removed_at'),
    moderationReason: text('moderation_reason'),
    moderationBy: text('moderation_by'),
    priceCurrency: text('price_currency').notNull().default('INR'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('listings_owner_idx').on(t.ownerId),
    index('listings_category_idx').on(t.categoryId),
    // Primary discovery index: find published HAVEs by (category, type).
    index('listings_match_idx').on(t.status, t.categoryId, t.type),
    index('listings_transaction_type_idx').on(t.status, t.transactionType),
    check(
      'listings_price_required_for_sale',
      sql`${t.transactionType} = 'barter' OR ${t.priceAmount} IS NOT NULL`,
    ),
    check('listings_price_positive', sql`${t.priceAmount} IS NULL OR ${t.priceAmount} > 0`),
  ],
);

export type ListingRow = typeof listings.$inferSelect;
export type NewListingRow = typeof listings.$inferInsert;
