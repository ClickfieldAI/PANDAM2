/**
 * Multi-table writes for the barter lifecycle. Everything here is built from
 * (a) single-statement compare-and-swap updates and (b) one `batch()` per
 * logical step, because D1 offers no interactive transactions. Every method is
 * IDEMPOTENT: calling it again after a crash or a client retry converges on
 * the same end state and never duplicates a row. Business rules (who may do
 * what, when) live in the Worker; these methods only perform the writes.
 */
import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import { newId } from '../id';
import {
  type BarterEventType,
  type BarterTransactionEventRow,
  barterTransactionEvents,
} from '../schema/barter-transaction-events';
import { type BarterTransactionRow, barterTransactions } from '../schema/barter-transactions';
import { conversationParticipants, conversations } from '../schema/conversations';
import { listings } from '../schema/listings';
import { needs } from '../schema/needs';
import { type OfferRow, offers } from '../schema/offers';

import { type Database, firstOrNull, now, runBatch, touch } from './helpers';

export type ParticipantRole = 'initiator' | 'counterparty';

export interface FinalizeAcceptanceInput {
  offer: OfferRow;
  /** Existing conversation for this offer, if one was already created. */
  existingConversationId: string | null;
  /** Other pending offers that touched either traded item. */
  siblingOfferIds: string[];
}

export function barterEngineRepository(db: Database) {
  const eventInsert = (
    transactionId: string,
    type: BarterEventType,
    actorUserId: string | null,
    at: number,
  ) =>
    db
      .insert(barterTransactionEvents)
      .values({ id: newId('barterEvent'), transactionId, actorUserId, type, createdAt: at })
      .onConflictDoNothing();

  return {
    /**
     * Create everything an accepted offer needs, atomically and idempotently:
     * the transaction (born `in_progress`), its first event, the conversation
     * and its participants, the item status changes, and the cancellation of
     * competing offers. Safe to call again for the same offer.
     */
    async finalizeAcceptance(input: FinalizeAcceptanceInput): Promise<void> {
      const { offer } = input;
      const at = now();
      const statements: PromiseLike<unknown>[] = [];

      const existing = await db
        .select({ id: barterTransactions.id })
        .from(barterTransactions)
        .where(eq(barterTransactions.offerId, offer.id))
        .limit(1);
      const transactionId = existing[0]?.id ?? newId('barterTransaction');
      if (!existing[0]) {
        statements.push(
          db
            .insert(barterTransactions)
            .values({
              id: transactionId,
              offerId: offer.id,
              initiatedByUserId: offer.fromUserId,
              counterpartyUserId: offer.toUserId,
              status: 'in_progress',
            })
            .onConflictDoNothing(),
        );
      }
      // The accepting user is the actor; (transaction, type, actor) is unique.
      statements.push(eventInsert(transactionId, 'accepted', offer.toUserId, at));

      if (!input.existingConversationId) {
        const conversationId = newId('conversation');
        statements.push(
          db.insert(conversations).values({ id: conversationId, offerId: offer.id }),
          db.insert(conversationParticipants).values(
            [offer.fromUserId, offer.toUserId].map((userId) => ({
              conversationId,
              userId,
              joinedAt: at,
            })),
          ),
        );
      }

      // The traded items leave the market — but only if still published.
      statements.push(
        db
          .update(listings)
          .set({ status: 'traded', ...touch() })
          .where(
            and(
              inArray(
                listings.id,
                [offer.offeredListingId, offer.requestedListingId].filter(
                  (id): id is string => id !== null,
                ),
              ),
              eq(listings.status, 'published'),
            ),
          ),
      );
      if (offer.requestedNeedId) {
        statements.push(
          db
            .update(needs)
            .set({ status: 'traded', ...touch() })
            .where(and(eq(needs.id, offer.requestedNeedId), eq(needs.status, 'published'))),
        );
      }
      if (input.siblingOfferIds.length > 0) {
        statements.push(
          db
            .update(offers)
            .set({ status: 'cancelled', respondedAt: at, ...touch() })
            .where(and(inArray(offers.id, input.siblingOfferIds), eq(offers.status, 'pending'))),
        );
      }

      await runBatch(db, statements);
    },

    /**
     * Record one party's confirmation. Returns the row if THIS call changed
     * something (first confirmation), or null if the party had already
     * confirmed / the trade is no longer open.
     */
    async confirm(
      transactionId: string,
      role: ParticipantRole,
      actorUserId: string,
    ): Promise<BarterTransactionRow | null> {
      const at = now();
      const column =
        role === 'initiator'
          ? { initiatorConfirmedAt: at, ...touch() }
          : { counterpartyConfirmedAt: at, ...touch() };
      const unconfirmed =
        role === 'initiator'
          ? isNull(barterTransactions.initiatorConfirmedAt)
          : isNull(barterTransactions.counterpartyConfirmedAt);
      const rows = await db
        .update(barterTransactions)
        .set(column)
        .where(
          and(
            eq(barterTransactions.id, transactionId),
            inArray(barterTransactions.status, ['created', 'in_progress']),
            unconfirmed,
          ),
        )
        .returning();
      const changed = firstOrNull(rows);
      if (changed) await eventInsert(transactionId, 'confirmed', actorUserId, at);
      return changed;
    },

    /**
     * Complete the trade iff BOTH parties have confirmed and it is still
     * open. Single compare-and-swap statement: of any number of concurrent
     * callers exactly one receives the row.
     */
    async completeIfBothConfirmed(
      transactionId: string,
      actorUserId: string,
    ): Promise<BarterTransactionRow | null> {
      const at = now();
      const rows = await db
        .update(barterTransactions)
        .set({ status: 'completed', completedAt: at, ...touch() })
        .where(
          and(
            eq(barterTransactions.id, transactionId),
            inArray(barterTransactions.status, ['created', 'in_progress']),
            isNotNull(barterTransactions.initiatorConfirmedAt),
            isNotNull(barterTransactions.counterpartyConfirmedAt),
          ),
        )
        .returning();
      const completed = firstOrNull(rows);
      if (completed) await eventInsert(transactionId, 'completed', actorUserId, at);
      return completed;
    },

    /**
     * Cancel an OPEN trade and put its items back on the market. The
     * compare-and-swap means a cancel can never win against a completed (or
     * already-cancelled) trade; the item restore only touches items that are
     * still `traded`, so it cannot resurrect anything the owner archived.
     */
    async cancelAndRestore(
      transactionId: string,
      actorUserId: string,
    ): Promise<BarterTransactionRow | null> {
      const at = now();
      const rows = await db
        .update(barterTransactions)
        .set({ status: 'cancelled', cancelledAt: at, ...touch() })
        .where(
          and(
            eq(barterTransactions.id, transactionId),
            or(
              eq(barterTransactions.status, 'created'),
              eq(barterTransactions.status, 'in_progress'),
            ),
          ),
        )
        .returning();
      const cancelled = firstOrNull(rows);
      if (!cancelled) return null;

      const offerRows = await db
        .select()
        .from(offers)
        .where(eq(offers.id, cancelled.offerId))
        .limit(1);
      const offer = firstOrNull(offerRows);
      const statements: PromiseLike<unknown>[] = [
        eventInsert(transactionId, 'cancelled', actorUserId, at),
      ];
      if (offer) {
        const listingIds = [offer.offeredListingId, offer.requestedListingId].filter(
          (id): id is string => id !== null,
        );
        statements.push(
          db
            .update(listings)
            .set({ status: 'published', ...touch() })
            .where(and(inArray(listings.id, listingIds), eq(listings.status, 'traded'))),
        );
        if (offer.requestedNeedId) {
          statements.push(
            db
              .update(needs)
              .set({ status: 'published', ...touch() })
              .where(and(eq(needs.id, offer.requestedNeedId), eq(needs.status, 'traded'))),
          );
        }
      }
      await runBatch(db, statements);
      return cancelled;
    },

    async listEvents(transactionId: string): Promise<BarterTransactionEventRow[]> {
      return db
        .select()
        .from(barterTransactionEvents)
        .where(eq(barterTransactionEvents.transactionId, transactionId))
        .orderBy(asc(barterTransactionEvents.createdAt));
    },
  };
}
