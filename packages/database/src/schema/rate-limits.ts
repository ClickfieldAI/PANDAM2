import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Fixed-window request counters for the API's rate limiter. One row per
 * (limiter + caller identity, window). The count is incremented by a single
 * atomic upsert, so concurrent requests cannot undercount. Old windows are
 * pruned opportunistically; the table holds counters only — no personal data
 * beyond the opaque identity key (a user id or an IP address).
 */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    /** Epoch-ms start of the window this row counts. */
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('rate_limits_window_idx').on(t.windowStart),
  ],
);
