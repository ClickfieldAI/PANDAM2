import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ITEM_TYPE, PUBLICATION_STATUS, createdAt, idColumn, updatedAt } from './_shared';
import { categories } from './categories';
import { users } from './users';

/**
 * "I NEED" — what a user wants in exchange. Deliberately the same shape as a
 * listing (owner, category, type, status) so a NEED and a HAVE can be matched
 * directly on (`categoryId`, `type`).
 */
export const needs = sqliteTable(
  'needs',
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
    /** See `listings.deletedAt`. */
    deletedAt: integer('deleted_at'),
    /** Set when staff removed this item; the owner cannot re-publish while set. */
    moderationRemovedAt: integer('moderation_removed_at'),
    moderationReason: text('moderation_reason'),
    moderationBy: text('moderation_by'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('needs_owner_idx').on(t.ownerId),
    index('needs_category_idx').on(t.categoryId),
    index('needs_match_idx').on(t.status, t.categoryId, t.type),
  ],
);

export type NeedRow = typeof needs.$inferSelect;
export type NewNeedRow = typeof needs.$inferInsert;
