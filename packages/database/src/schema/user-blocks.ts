import { sql } from 'drizzle-orm';
import { check, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt } from './_shared';
import { users } from './users';

/**
 * "A has blocked B". One row per ordered pair; the composite primary key makes
 * blocking idempotent. The block applies in BOTH directions at enforcement
 * time (neither person can contact or see the other's listings), but only the
 * blocker can see or remove it — the blocked person is never told.
 */
export const userBlocks = sqliteTable(
  'user_blocks',
  {
    blockerId: text('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check('user_blocks_distinct', sql`${t.blockerId} <> ${t.blockedId}`),
    index('user_blocks_blocked_idx').on(t.blockedId),
  ],
);

export type UserBlockRow = typeof userBlocks.$inferSelect;
