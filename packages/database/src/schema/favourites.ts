import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt } from './_shared';
import { listings } from './listings';
import { users } from './users';

/**
 * A user's saved ("hearted") listings. One row per (user, listing); the
 * composite primary key makes saving idempotent and race-safe. Rows are
 * private to their owner and cascade away with either the user or the listing.
 */
export const favourites = sqliteTable(
  'favourites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: text('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    createdAt,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.listingId] }),
    index('favourites_user_idx').on(t.userId, t.createdAt),
  ],
);

export type FavouriteRow = typeof favourites.$inferSelect;
