/**
 * Deleting a listing or an I NEED request.
 *
 * Offers reference items with ON DELETE CASCADE, so a careless hard delete
 * would silently erase other people's offer history. The policy, enforced in
 * SQL so it holds even if two requests race:
 *
 *  - no offer ever referenced the item  -> hard delete (photos and saves cascade)
 *  - it has history                     -> soft delete: archived + `deleted_at`,
 *                                          hidden everywhere, rows kept
 *  - it is part of an OPEN trade        -> refused
 */
import { and, eq, inArray, isNull, notExists, or } from 'drizzle-orm';

import { barterTransactions } from '../schema/barter-transactions';
import { listingImages } from '../schema/listing-images';
import { listings } from '../schema/listings';
import { needImages } from '../schema/need-images';
import { needs } from '../schema/needs';
import { type OfferRow, offers } from '../schema/offers';

import { type Database, firstOrNull, now, touch } from './helpers';

export type ItemKind = 'listing' | 'need';
export type DeleteOutcome = 'deleted' | 'archived' | 'blocked' | 'missing';

export function itemLifecycleRepository(db: Database) {
  /** SQL predicate: this offer touches the item (as offered or requested). */
  const touchesItem = (kind: ItemKind, id: string) =>
    kind === 'listing'
      ? or(eq(offers.offeredListingId, id), eq(offers.requestedListingId, id))
      : eq(offers.requestedNeedId, id);

  /** SQL subquery: some offer references this item. */
  const referencedByOffer = (kind: ItemKind, id: string) =>
    db.select({ id: offers.id }).from(offers).where(touchesItem(kind, id));

  /** SQL subquery: an offer on this item whose trade is still open. */
  const openTrade = (kind: ItemKind, id: string) =>
    db
      .select({ id: barterTransactions.id })
      .from(barterTransactions)
      .innerJoin(offers, eq(offers.id, barterTransactions.offerId))
      .where(
        and(
          touchesItem(kind, id),
          inArray(barterTransactions.status, ['created', 'in_progress', 'disputed']),
        ),
      );

  return {
    async hasOpenTrade(kind: ItemKind, id: string): Promise<boolean> {
      return (await openTrade(kind, id).limit(1)).length > 0;
    },

    /** Pending offers on this item (as offered or requested). */
    async pendingOffers(kind: ItemKind, id: string): Promise<OfferRow[]> {
      return db
        .select()
        .from(offers)
        .where(and(eq(offers.status, 'pending'), touchesItem(kind, id)));
    },

    async imageKeys(kind: ItemKind, id: string): Promise<string[]> {
      const rows =
        kind === 'listing'
          ? await db
              .select({ key: listingImages.objectKey })
              .from(listingImages)
              .where(eq(listingImages.listingId, id))
          : await db
              .select({ key: needImages.objectKey })
              .from(needImages)
              .where(eq(needImages.needId, id));
      return rows.map((r) => r.key);
    },

    /**
     * Withdraw the still-pending offers on an item (one statement, so each
     * offer is withdrawn exactly once). Returns the offers actually changed.
     */
    async withdrawPendingOffers(kind: ItemKind, id: string): Promise<OfferRow[]> {
      return db
        .update(offers)
        .set({ status: 'cancelled', respondedAt: now(), ...touch() })
        .where(and(eq(offers.status, 'pending'), touchesItem(kind, id)))
        .returning();
    },

    /**
     * Delete according to the policy above. Each step is a single conditional
     * statement, so a concurrent offer or accept cannot slip between a check
     * and the write.
     */
    async deleteItem(kind: ItemKind, id: string, ownerId: string): Promise<DeleteOutcome> {
      const table = kind === 'listing' ? listings : needs;
      // 1. Never referenced by any offer -> really delete it.
      const hard = await db
        .delete(table)
        .where(
          and(
            eq(table.id, id),
            eq(table.ownerId, ownerId),
            isNull(table.deletedAt),
            notExists(referencedByOffer(kind, id)),
          ),
        )
        .returning({ id: table.id });
      if (hard.length > 0) return 'deleted';

      // 2. Has history -> hide it, unless a trade on it is still open.
      const soft = await db
        .update(table)
        .set({ status: 'archived', deletedAt: now(), ...touch() })
        .where(
          and(
            eq(table.id, id),
            eq(table.ownerId, ownerId),
            isNull(table.deletedAt),
            notExists(openTrade(kind, id)),
          ),
        )
        .returning({ id: table.id });
      if (soft.length > 0) return 'archived';

      // 3. Neither: missing / not yours / already deleted — or blocked by an open trade.
      const row = firstOrNull(
        await db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, id), eq(table.ownerId, ownerId), isNull(table.deletedAt)))
          .limit(1),
      );
      return row ? 'blocked' : 'missing';
    },
  };
}
