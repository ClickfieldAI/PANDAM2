/**
 * Barter lifecycle orchestration. Routes stay thin; this is where the rules
 * that must hold under retries and concurrency live:
 *
 *  - Every state change is a compare-and-swap in the database, so of two
 *    racing requests exactly one wins and the loser gets a clean answer.
 *  - Multi-table follow-up work is idempotent (`finalizeAcceptance`), so a
 *    crash between the CAS and the follow-up is repaired by retrying.
 *  - A trade completes only after BOTH parties confirm.
 */
import { type OfferRow, type BarterTransactionRow } from '@pandam/database';
import { type Context } from 'hono';

import { ApiError } from '../lib/http';
import { type AppEnv } from '../types';

import { assertCanInteract } from './blocks';
import { notify } from './notify';

type Ctx = Context<AppEnv>;

/** Is the item the offer is built on still available to trade? */
async function assertItemsAvailable(c: Ctx, offer: OfferRow): Promise<void> {
  const { repos } = c.get('ctx');
  const offered = await repos.listings.findById(offer.offeredListingId);
  if (!offered || offered.status !== 'published' || offered.ownerId !== offer.fromUserId) {
    throw new ApiError('unprocessable', 'The item offered is no longer available to trade.');
  }
  if (offer.requestedListingId) {
    const requested = await repos.listings.findById(offer.requestedListingId);
    if (!requested || requested.status !== 'published' || requested.ownerId !== offer.toUserId) {
      throw new ApiError('unprocessable', 'That listing is no longer available to trade.');
    }
  } else if (offer.requestedNeedId) {
    const need = await repos.needs.findById(offer.requestedNeedId);
    if (!need || need.status !== 'published' || need.ownerId !== offer.toUserId) {
      throw new ApiError('unprocessable', 'That request is not open any more.');
    }
  }
}

/** Make sure an accepted offer has its transaction, conversation and item states. Idempotent. */
export async function ensureAcceptanceFinalized(c: Ctx, offer: OfferRow): Promise<boolean> {
  const { repos } = c.get('ctx');
  const [transaction, conversation] = await Promise.all([
    repos.barterTransactions.findByOffer(offer.id),
    repos.conversations.findByOffer(offer.id),
  ]);
  const created = transaction === null;
  const listingIds = [offer.offeredListingId, offer.requestedListingId].filter(
    (id): id is string => id !== null,
  );
  const needIds = offer.requestedNeedId ? [offer.requestedNeedId] : [];
  const siblings = await repos.offers.listPendingTouchingItems(listingIds, needIds, offer.id);

  await repos.barterEngine.finalizeAcceptance({
    offer,
    existingConversationId: conversation?.id ?? null,
    siblingOfferIds: siblings.map((s) => s.id),
  });

  await Promise.all(
    siblings.map(async (sibling) => {
      const after = await repos.offers.findById(sibling.id);
      if (after?.status === 'cancelled') {
        await notify(c, {
          userId: sibling.fromUserId,
          type: 'offer_cancelled',
          data: { offerId: sibling.id },
        });
      }
    }),
  );
  return created;
}

export async function acceptOffer(c: Ctx, offerId: string, userId: string): Promise<OfferRow> {
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(offerId);
  if (!offer || (offer.fromUserId !== userId && offer.toUserId !== userId)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  if (offer.toUserId !== userId) {
    throw new ApiError('forbidden', 'Only the recipient can respond to an offer.');
  }

  // Retry of an accept that already succeeded (lost response, double tap):
  // finish anything a crash left undone and report the current state.
  if (offer.status === 'accepted') {
    await ensureAcceptanceFinalized(c, offer);
    return (await repos.offers.findById(offerId))!;
  }
  if (offer.status !== 'pending') {
    throw new ApiError(
      'unprocessable',
      `That offer is ${offer.status} and can no longer be accepted.`,
    );
  }

  // A block placed since the offer was sent stops it being accepted.
  await assertCanInteract(c, userId, offer.fromUserId);

  const nowMs = Date.now();
  if (offer.expiresAt !== null && offer.expiresAt <= nowMs) {
    const expired = await repos.offers.expireIfDue(offer.id, nowMs);
    if (expired) {
      await notify(c, {
        userId: offer.fromUserId,
        type: 'offer_expired',
        data: { offerId: offer.id },
      });
    }
    throw new ApiError('unprocessable', 'That offer has expired.');
  }
  await assertItemsAvailable(c, offer);

  // The compare-and-swap: only one concurrent accept gets the row back.
  const won = await repos.offers.acceptIfPending(offer.id, nowMs);
  if (!won) {
    const current = await repos.offers.findById(offer.id);
    if (current?.status === 'accepted') {
      await ensureAcceptanceFinalized(c, current);
      return current;
    }
    throw new ApiError(
      'unprocessable',
      `That offer is ${current?.status ?? 'no longer open'} and can no longer be accepted.`,
    );
  }

  const newlyCreated = await ensureAcceptanceFinalized(c, won);
  if (newlyCreated) {
    const transaction = await repos.barterTransactions.findByOffer(won.id);
    const conversation = await repos.conversations.findByOffer(won.id);
    await notify(c, {
      userId: won.fromUserId,
      type: 'offer_accepted',
      data: {
        offerId: won.id,
        ...(transaction ? { transactionId: transaction.id } : {}),
        ...(conversation ? { conversationId: conversation.id } : {}),
      },
    });
  }
  return (await repos.offers.findById(offerId))!;
}

/** Reject (recipient) or withdraw (sender) — a compare-and-swap on `pending`. */
export async function closeOffer(
  c: Ctx,
  offerId: string,
  userId: string,
  action: 'reject' | 'cancel',
): Promise<OfferRow> {
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(offerId);
  if (!offer || (offer.fromUserId !== userId && offer.toUserId !== userId)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  if (action === 'cancel' && offer.fromUserId !== userId) {
    throw new ApiError('forbidden', 'Only the sender can cancel an offer.');
  }
  if (action === 'reject' && offer.toUserId !== userId) {
    throw new ApiError('forbidden', 'Only the recipient can respond to an offer.');
  }
  const target = action === 'reject' ? 'rejected' : 'cancelled';
  // Idempotent retry: already in the requested end state.
  if (offer.status === target) return offer;
  if (offer.status !== 'pending') {
    throw new ApiError(
      'unprocessable',
      `That offer is ${offer.status} and can no longer be changed.`,
    );
  }
  const closed = await repos.offers.closeIfPending(offer.id, target);
  if (!closed) {
    const current = await repos.offers.findById(offer.id);
    if (current?.status === target) return current;
    throw new ApiError(
      'unprocessable',
      `That offer is ${current?.status ?? 'closed'} and can no longer be changed.`,
    );
  }
  await notify(c, {
    userId: offer.fromUserId === userId ? offer.toUserId : offer.fromUserId,
    type: action === 'reject' ? 'offer_rejected' : 'offer_cancelled',
    data: { offerId: offer.id },
  });
  return closed;
}

function roleOf(t: BarterTransactionRow, userId: string): 'initiator' | 'counterparty' | null {
  if (t.initiatedByUserId === userId) return 'initiator';
  if (t.counterpartyUserId === userId) return 'counterparty';
  return null;
}

/**
 * "The exchange happened" from this user's side. The trade completes only
 * when both parties have confirmed. Re-confirming is a harmless no-op.
 */
export async function confirmTransaction(
  c: Ctx,
  transactionId: string,
  userId: string,
): Promise<BarterTransactionRow> {
  const { repos } = c.get('ctx');
  const t = await repos.barterTransactions.findById(transactionId);
  const role = t ? roleOf(t, userId) : null;
  if (!t || !role) throw new ApiError('not_found', 'That transaction does not exist.');
  if (t.status === 'cancelled') {
    throw new ApiError('unprocessable', 'That trade was cancelled and cannot be confirmed.');
  }
  if (t.status === 'disputed') {
    throw new ApiError('unprocessable', 'That trade is under dispute and cannot be confirmed.');
  }

  const first = await repos.barterEngine.confirm(t.id, role, userId);
  const completed = await repos.barterEngine.completeIfBothConfirmed(t.id, userId);
  const other = role === 'initiator' ? t.counterpartyUserId : t.initiatedByUserId;
  if (completed) {
    await Promise.all([
      notify(c, {
        userId: other,
        type: 'transaction_updated',
        data: { transactionId: t.id, status: 'completed' },
      }),
      notify(c, {
        userId,
        type: 'transaction_updated',
        data: { transactionId: t.id, status: 'completed' },
      }),
    ]);
  } else if (first) {
    await notify(c, {
      userId: other,
      type: 'transaction_updated',
      data: { transactionId: t.id, status: 'awaiting_confirmation' },
      title: 'Confirm your trade',
      body: 'Your trade partner confirmed the exchange. Confirm it too to finish.',
    });
  }
  return (await repos.barterTransactions.findById(t.id))!;
}

/** Cancel an open trade; both items return to the market. */
export async function cancelTransaction(
  c: Ctx,
  transactionId: string,
  userId: string,
): Promise<BarterTransactionRow> {
  const { repos } = c.get('ctx');
  const t = await repos.barterTransactions.findById(transactionId);
  const role = t ? roleOf(t, userId) : null;
  if (!t || !role) throw new ApiError('not_found', 'That transaction does not exist.');
  if (t.status === 'cancelled') return t; // idempotent retry
  if (t.status === 'completed') {
    throw new ApiError('unprocessable', 'A completed trade cannot be cancelled.');
  }
  if (t.status === 'disputed') {
    throw new ApiError(
      'unprocessable',
      'That trade is under dispute and cannot be cancelled here.',
    );
  }
  const cancelled = await repos.barterEngine.cancelAndRestore(t.id, userId);
  if (!cancelled) {
    const current = await repos.barterTransactions.findById(t.id);
    if (current?.status === 'cancelled') return current;
    throw new ApiError(
      'unprocessable',
      `That trade is ${current?.status ?? 'closed'} and cannot be cancelled.`,
    );
  }
  const other = role === 'initiator' ? t.counterpartyUserId : t.initiatedByUserId;
  await notify(c, {
    userId: other,
    type: 'transaction_updated',
    data: { transactionId: t.id, status: 'cancelled' },
  });
  return cancelled;
}

/** Legacy `start` for rows created before this engine: created -> in_progress, idempotent. */
export async function startLegacyTransaction(
  c: Ctx,
  transactionId: string,
  userId: string,
): Promise<BarterTransactionRow> {
  const { repos } = c.get('ctx');
  const t = await repos.barterTransactions.findById(transactionId);
  if (!t || roleOf(t, userId) === null)
    throw new ApiError('not_found', 'That transaction does not exist.');
  if (t.status === 'created') {
    return (await repos.barterTransactions.applyStatus(t.id, 'in_progress')) ?? t;
  }
  return t;
}

/** A negotiation may be countered this many times; after that the parties must accept or walk away. */
export const MAX_COUNTER_DEPTH = 3;

export interface CounterInput {
  offeredListingId: string;
  requestedListingId: string;
  message?: string | undefined;
  expiresAt?: number | undefined;
}

/** How many counters already sit above this offer in its chain. */
async function counterDepth(c: Ctx, offer: OfferRow): Promise<number> {
  const { repos } = c.get('ctx');
  let depth = 0;
  let cursor: OfferRow | null = offer;
  while (cursor?.parentOfferId && depth <= MAX_COUNTER_DEPTH + 1) {
    depth += 1;
    cursor = await repos.offers.findById(cursor.parentOfferId);
  }
  return depth;
}

/**
 * The recipient answers a pending offer with a different swap. The original
 * becomes `countered` (compare-and-swap, so a counter and an accept racing on
 * the same offer have exactly one winner) and a new pending offer, linked by
 * `parentOfferId`, goes back to the original sender. Retrying returns the
 * counter that already exists instead of making a second one.
 */
export async function counterOffer(
  c: Ctx,
  offerId: string,
  userId: string,
  input: CounterInput,
): Promise<OfferRow> {
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(offerId);
  if (!offer || (offer.fromUserId !== userId && offer.toUserId !== userId)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  if (offer.toUserId !== userId) {
    throw new ApiError('forbidden', 'Only the recipient can counter an offer.');
  }

  // Idempotent retry: this offer was already countered — return that counter.
  if (offer.status === 'countered') {
    const existing = await repos.offers.findChildOf(offer.id);
    if (existing) return existing;
    // Crash between the status change and the counter's creation: finish it below.
  } else if (offer.status !== 'pending') {
    throw new ApiError(
      'unprocessable',
      `That offer is ${offer.status} and can no longer be countered.`,
    );
  }

  await assertCanInteract(c, userId, offer.fromUserId);

  const nowMs = Date.now();
  if (offer.status === 'pending' && offer.expiresAt !== null && offer.expiresAt <= nowMs) {
    const expired = await repos.offers.expireIfDue(offer.id, nowMs);
    if (expired) {
      await notify(c, {
        userId: offer.fromUserId,
        type: 'offer_expired',
        data: { offerId: offer.id },
      });
    }
    throw new ApiError('unprocessable', 'That offer has expired.');
  }
  if (!offer.requestedListingId) {
    throw new ApiError(
      'unprocessable',
      'Counter offers are only available for item-for-item trades, not for requests.',
    );
  }
  if (input.expiresAt !== undefined && input.expiresAt <= nowMs) {
    throw new ApiError('unprocessable', 'A counter offer must expire in the future.');
  }
  if ((await counterDepth(c, offer)) >= MAX_COUNTER_DEPTH) {
    throw new ApiError(
      'unprocessable',
      'This negotiation has been countered too many times. Accept, reject or start a new offer.',
    );
  }

  // Both ends must be real, published, barter-eligible, and belong to the right person.
  const [mine, theirs] = await Promise.all([
    repos.listings.findById(input.offeredListingId),
    repos.listings.findById(input.requestedListingId),
  ]);
  if (!mine || mine.status !== 'published' || mine.ownerId !== userId) {
    throw new ApiError('unprocessable', 'You can only offer your own published listing.');
  }
  if (!theirs || theirs.status !== 'published' || theirs.ownerId !== offer.fromUserId) {
    throw new ApiError('unprocessable', 'That item is not available from the other person.');
  }
  if (mine.transactionType === 'sale' || theirs.transactionType === 'sale') {
    throw new ApiError('unprocessable', 'A sale-only listing cannot be part of a barter offer.');
  }
  const duplicate = await repos.offers.findPendingDuplicate(userId, theirs.id, null);
  if (duplicate) {
    throw new ApiError('unprocessable', 'You already have a pending request for that item.');
  }

  // The compare-and-swap: only one of {counter, accept, reject, withdraw} wins.
  if (offer.status === 'pending') {
    const won = await repos.offers.counterIfPending(offer.id, nowMs);
    if (!won) {
      const current = await repos.offers.findById(offer.id);
      const existing =
        current?.status === 'countered' ? await repos.offers.findChildOf(offer.id) : null;
      if (existing) return existing;
      throw new ApiError(
        'unprocessable',
        `That offer is ${current?.status ?? 'no longer open'} and can no longer be countered.`,
      );
    }
  }

  let counter: OfferRow;
  try {
    counter = await repos.offers.create({
      fromUserId: userId,
      toUserId: offer.fromUserId,
      offeredListingId: mine.id,
      requestedListingId: theirs.id,
      requestedNeedId: null,
      parentOfferId: offer.id,
      matchId: null,
      imageKey: null,
      idempotencyKey: null,
      message: input.message ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  } catch (error) {
    // A concurrent identical counter already created it — return that one.
    const existing = await repos.offers.findChildOf(offer.id);
    if (existing) return existing;
    // Otherwise put the original back so the recipient is not left with a dead offer.
    await repos.offers.reopenIfNoChild(offer.id);
    throw error;
  }

  await notify(c, {
    userId: offer.fromUserId,
    type: 'offer_countered',
    data: { offerId: counter.id, previousOfferId: offer.id },
  });
  return counter;
}
