import { and, desc, eq, gt, inArray, isNull, lte, ne, or } from 'drizzle-orm';

import { newId } from '../id';
import { type NewOfferRow, type OfferRow, type OfferStatus, offers } from '../schema/offers';

import { type Database, firstOrNull, now, one, touch } from './helpers';

export type CreateOfferInput = Omit<
  NewOfferRow,
  'id' | 'status' | 'respondedAt' | 'createdAt' | 'updatedAt'
>;

export function offersRepository(db: Database) {
  return {
    async create(input: CreateOfferInput): Promise<OfferRow> {
      const rows = await db
        .insert(offers)
        .values({ ...input, id: newId('offer'), status: 'pending' })
        .returning();
      return one(rows, 'offers.create');
    },

    /**
     * Withdraw every still-pending offer between two people, in either
     * direction (used when one blocks the other). One statement; returns the
     * offers actually changed.
     */
    async cancelPendingBetween(userA: string, userB: string): Promise<OfferRow[]> {
      return db
        .update(offers)
        .set({ status: 'cancelled', respondedAt: now(), ...touch() })
        .where(
          and(
            eq(offers.status, 'pending'),
            or(
              and(eq(offers.fromUserId, userA), eq(offers.toUserId, userB)),
              and(eq(offers.fromUserId, userB), eq(offers.toUserId, userA)),
            ),
          ),
        )
        .returning();
    },

    /** Is this user a party to any offer that references the item? (Lets them report it after it is unpublished.) */
    async involvesItem(userId: string, itemId: string): Promise<boolean> {
      const rows = await db
        .select({ id: offers.id })
        .from(offers)
        .where(
          and(
            or(eq(offers.fromUserId, userId), eq(offers.toUserId, userId)),
            or(
              eq(offers.offeredListingId, itemId),
              eq(offers.requestedListingId, itemId),
              eq(offers.requestedNeedId, itemId),
            ),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** The offer this sender already created with this retry key, if any. */
    async findByIdempotencyKey(fromUserId: string, key: string): Promise<OfferRow | null> {
      const rows = await db
        .select()
        .from(offers)
        .where(and(eq(offers.fromUserId, fromUserId), eq(offers.idempotencyKey, key)))
        .limit(1);
      return firstOrNull(rows);
    },

    async findById(id: string): Promise<OfferRow | null> {
      const rows = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
      return firstOrNull(rows);
    },

    /**
     * An existing `pending` offer from this sender against this exact
     * requested item (listing XOR need), if any. Used to reject a duplicate
     * request before it is created — one pending ask per (sender, item) at a
     * time; the sender can always try again after a reject/cancel/expiry.
     */
    async findPendingDuplicate(
      fromUserId: string,
      requestedListingId: string | null,
      requestedNeedId: string | null,
    ): Promise<OfferRow | null> {
      const itemClause = requestedListingId
        ? eq(offers.requestedListingId, requestedListingId)
        : eq(offers.requestedNeedId, requestedNeedId!);
      const rows = await db
        .select()
        .from(offers)
        .where(and(eq(offers.fromUserId, fromUserId), eq(offers.status, 'pending'), itemClause))
        .limit(1);
      return firstOrNull(rows);
    },

    async listIncoming(userId: string, status?: OfferStatus): Promise<OfferRow[]> {
      const where = status
        ? and(eq(offers.toUserId, userId), eq(offers.status, status))
        : eq(offers.toUserId, userId);
      return db.select().from(offers).where(where).orderBy(desc(offers.createdAt));
    },

    async listOutgoing(userId: string, status?: OfferStatus): Promise<OfferRow[]> {
      const where = status
        ? and(eq(offers.fromUserId, userId), eq(offers.status, status))
        : eq(offers.fromUserId, userId);
      return db.select().from(offers).where(where).orderBy(desc(offers.createdAt));
    },

    /**
     * Compare-and-swap: pending -> accepted, ONLY if the offer is still
     * pending and not past its expiry. One SQL statement, so of any number of
     * concurrent callers exactly one gets the row back; the rest get null.
     */
    async acceptIfPending(id: string, nowMs: number): Promise<OfferRow | null> {
      const rows = await db
        .update(offers)
        .set({ status: 'accepted', respondedAt: nowMs, ...touch() })
        .where(
          and(
            eq(offers.id, id),
            eq(offers.status, 'pending'),
            or(isNull(offers.expiresAt), gt(offers.expiresAt, nowMs)),
          ),
        )
        .returning();
      return firstOrNull(rows);
    },

    /** Compare-and-swap: pending -> countered (the recipient answered with a counter). */
    async counterIfPending(id: string, nowMs: number): Promise<OfferRow | null> {
      const rows = await db
        .update(offers)
        .set({ status: 'countered', respondedAt: nowMs, ...touch() })
        .where(
          and(
            eq(offers.id, id),
            eq(offers.status, 'pending'),
            or(isNull(offers.expiresAt), gt(offers.expiresAt, nowMs)),
          ),
        )
        .returning();
      return firstOrNull(rows);
    },

    /** Undo a counter whose follow-up offer could not be created (only if no child exists). */
    async reopenIfNoChild(id: string): Promise<void> {
      const child = await db
        .select({ id: offers.id })
        .from(offers)
        .where(eq(offers.parentOfferId, id))
        .limit(1);
      if (child.length > 0) return;
      await db
        .update(offers)
        .set({ status: 'pending', respondedAt: null, ...touch() })
        .where(and(eq(offers.id, id), eq(offers.status, 'countered')));
    },

    /** The counter-offer that answered this offer, if any. */
    async findChildOf(parentOfferId: string): Promise<OfferRow | null> {
      const rows = await db
        .select()
        .from(offers)
        .where(eq(offers.parentOfferId, parentOfferId))
        .limit(1);
      return firstOrNull(rows);
    },

    /** The whole negotiation this offer belongs to, oldest first (a simple chain). */
    async findChain(offerId: string): Promise<OfferRow[]> {
      const MAX = 16; // far above the counter limit; only guards against corrupt cycles
      let root = await db
        .select()
        .from(offers)
        .where(eq(offers.id, offerId))
        .limit(1)
        .then(firstOrNull);
      for (let i = 0; root?.parentOfferId && i < MAX; i += 1) {
        const parent = await db
          .select()
          .from(offers)
          .where(eq(offers.id, root.parentOfferId))
          .limit(1)
          .then(firstOrNull);
        if (!parent) break;
        root = parent;
      }
      const chain: OfferRow[] = [];
      let cursor: OfferRow | null = root;
      for (let i = 0; cursor && i < MAX; i += 1) {
        chain.push(cursor);
        cursor = await db
          .select()
          .from(offers)
          .where(eq(offers.parentOfferId, cursor.id))
          .limit(1)
          .then(firstOrNull);
      }
      return chain;
    },

    /** Compare-and-swap: pending -> expired (only if actually past expiry). */
    async expireIfDue(id: string, nowMs: number): Promise<OfferRow | null> {
      const rows = await db
        .update(offers)
        .set({ status: 'expired', respondedAt: nowMs, ...touch() })
        .where(and(eq(offers.id, id), eq(offers.status, 'pending'), lte(offers.expiresAt, nowMs)))
        .returning();
      return firstOrNull(rows);
    },

    /** Compare-and-swap for reject / withdraw: only a still-pending offer closes. */
    async closeIfPending(id: string, status: 'rejected' | 'cancelled'): Promise<OfferRow | null> {
      const rows = await db
        .update(offers)
        .set({ status, respondedAt: now(), ...touch() })
        .where(and(eq(offers.id, id), eq(offers.status, 'pending')))
        .returning();
      return firstOrNull(rows);
    },

    /**
     * Persist a status transition. Callers MUST validate the transition with
     * `assertOfferTransition` (Worker domain layer) first; this method only
     * writes and stamps `respondedAt` for terminal responses.
     */
    async applyStatus(id: string, status: OfferStatus): Promise<OfferRow | null> {
      const respondedAt = status === 'pending' ? undefined : now();
      const rows = await db
        .update(offers)
        .set({ status, ...(respondedAt ? { respondedAt } : {}), ...touch() })
        .where(eq(offers.id, id))
        .returning();
      return firstOrNull(rows);
    },

    /**
     * Other still-`pending` offers that touch either item side of the offer
     * being accepted (as the offered listing OR the requested listing/need,
     * on either side of that other offer). Used to auto-close siblings once
     * one offer on the same item is accepted — an item can only be traded
     * once.
     */
    async listPendingTouchingItems(
      listingIds: string[],
      needIds: string[],
      excludeOfferId: string,
    ): Promise<OfferRow[]> {
      if (listingIds.length === 0 && needIds.length === 0) return [];
      const itemClauses = [
        listingIds.length > 0 ? inArray(offers.offeredListingId, listingIds) : undefined,
        listingIds.length > 0 ? inArray(offers.requestedListingId, listingIds) : undefined,
        needIds.length > 0 ? inArray(offers.requestedNeedId, needIds) : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      return db
        .select()
        .from(offers)
        .where(
          and(eq(offers.status, 'pending'), ne(offers.id, excludeOfferId), or(...itemClauses)),
        );
    },
  };
}

export type OffersRepository = ReturnType<typeof offersRepository>;
