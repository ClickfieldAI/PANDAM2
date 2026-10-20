import { and, eq, lt, sql } from 'drizzle-orm';

import { rateLimits } from '../schema/rate-limits';

import { type Database } from './helpers';

export function rateLimitsRepository(db: Database) {
  return {
    /**
     * Count one request in the window and return the new total. A single
     * upsert statement: the database serialises it, so N concurrent callers
     * receive N distinct, increasing counts.
     */
    async hit(key: string, windowStart: number): Promise<number> {
      const rows = await db
        .insert(rateLimits)
        .values({ key, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });
      return rows[0]?.count ?? 1;
    },

    /** The current total for a key in a window, without counting a hit. */
    async count(key: string, windowStart: number): Promise<number> {
      const rows = await db
        .select({ count: rateLimits.count })
        .from(rateLimits)
        .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
        .limit(1);
      return rows[0]?.count ?? 0;
    },

    /** Delete counters for windows that ended before `beforeMs`. */
    async prune(beforeMs: number): Promise<void> {
      await db.delete(rateLimits).where(lt(rateLimits.windowStart, beforeMs));
    },
  };
}
