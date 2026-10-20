import { and, desc, eq, inArray } from 'drizzle-orm';

import { favourites } from '../schema/favourites';

import { type Database, now } from './helpers';

export function favouritesRepository(db: Database) {
  return {
    /** Save a listing. Idempotent: saving twice is one row, never an error. */
    /** True when newly saved, false when it already was. */
    async add(userId: string, listingId: string): Promise<boolean> {
      const rows = await db
        .insert(favourites)
        .values({ userId, listingId, createdAt: now() })
        .onConflictDoNothing()
        .returning({ id: favourites.listingId });
      return rows.length > 0;
    },

    /** Unsave a listing. Idempotent: removing something not saved is a no-op. */
    async remove(userId: string, listingId: string): Promise<void> {
      await db
        .delete(favourites)
        .where(and(eq(favourites.userId, userId), eq(favourites.listingId, listingId)));
    },

    /** Remove a listing from everyone's saved lists (used when it is hidden). */
    async removeAllFor(listingId: string): Promise<void> {
      await db.delete(favourites).where(eq(favourites.listingId, listingId));
    },

    /** Which of these listings has this user saved? */
    async savedAmong(userId: string, listingIds: string[]): Promise<Set<string>> {
      if (listingIds.length === 0) return new Set();
      const rows = await db
        .select({ listingId: favourites.listingId })
        .from(favourites)
        .where(and(eq(favourites.userId, userId), inArray(favourites.listingId, listingIds)));
      return new Set(rows.map((r) => r.listingId));
    },

    /** The user's saved listing ids, newest save first. */
    async listIds(userId: string, limit: number): Promise<string[]> {
      const rows = await db
        .select({ listingId: favourites.listingId })
        .from(favourites)
        .where(eq(favourites.userId, userId))
        .orderBy(desc(favourites.createdAt), desc(favourites.listingId))
        .limit(limit);
      return rows.map((r) => r.listingId);
    },
  };
}
