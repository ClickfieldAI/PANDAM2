/**
 * `/api/v1/transactions` — barter transactions (non-monetary), created
 * automatically when an offer is accepted (see `routes/api/v1/offers.ts`).
 *
 *   GET  /             every transaction the caller is a party to
 *   GET  /:id          one transaction (a party to it only)
 *   POST /:id/status   advance the lifecycle: start / complete / cancel
 *
 * There is no amount, currency, fee or balance here by design — see
 * `domain/barter.ts`. A real-money purchase is a `payments` row, never this.
 */
import { type BarterTransactionView, type ItemRef, type OwnerRef } from '@pandam/types';
import { transactionStatusUpdateSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { coverImageUrl, toOwnerRef } from '../../../lib/serialize';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import {
  cancelTransaction,
  confirmTransaction,
  startLegacyTransaction,
} from '../../../services/barter';
import { type AppEnv } from '../../../types';

export const transactionsRoute = new Hono<AppEnv>();

transactionsRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  // Every transaction realises exactly one accepted offer (1:1), so the
  // caller's transactions are exactly the accepted offers they were a party
  // to — same derivation as `conversations.ts`.
  const [incoming, outgoing] = await Promise.all([
    repos.offers.listIncoming(user.id, 'accepted'),
    repos.offers.listOutgoing(user.id, 'accepted'),
  ]);
  const offerIds = [...incoming, ...outgoing].map((o) => o.id);
  const rows = (
    await Promise.all(offerIds.map((id) => repos.barterTransactions.findByOffer(id)))
  ).filter((t): t is NonNullable<typeof t> => t !== null);

  const items = await Promise.all(rows.map((t) => hydrate(c, t, user.id)));
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return sendOk(c, { items });
});

transactionsRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const t = await repos.barterTransactions.findById(c.req.param('id'));
  if (!t || (t.initiatedByUserId !== user.id && t.counterpartyUserId !== user.id)) {
    throw new ApiError('not_found', 'That transaction does not exist.');
  }
  return sendOk(c, { transaction: await hydrate(c, t, user.id) });
});

transactionsRoute.post('/:id/status', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const id = c.req.param('id');
  const { action } = await parseBody(c, transactionStatusUpdateSchema);

  // Rules, compare-and-swap writes and notifications live in services/barter.ts.
  // 'complete' is the legacy name for 'confirm': it can never complete a trade
  // on one party's word — both parties must confirm.
  if (action === 'cancel') await cancelTransaction(c, id, user.id);
  else if (action === 'start') await startLegacyTransaction(c, id, user.id);
  else await confirmTransaction(c, id, user.id);

  const updated = await repos.barterTransactions.findById(id);
  return sendOk(c, { transaction: await hydrate(c, updated!, user.id) });
});

async function hydrate(
  c: Context<AppEnv>,
  t: {
    id: string;
    status: string;
    offerId: string;
    initiatedByUserId: string;
    counterpartyUserId: string;
    initiatorConfirmedAt: number | null;
    counterpartyConfirmedAt: number | null;
    completedAt: number | null;
    cancelledAt: number | null;
    createdAt: number;
    updatedAt: number;
  },
  meId: string,
): Promise<BarterTransactionView> {
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(t.offerId);

  const counterpartyId = t.initiatedByUserId === meId ? t.counterpartyUserId : t.initiatedByUserId;
  const counterpartyProfile = await repos.profiles.findByUserId(counterpartyId);
  const counterparty: OwnerRef = toOwnerRef(counterpartyId, counterpartyProfile);

  const emptyItem: ItemRef = {
    id: '',
    title: 'Listing removed',
    type: 'product',
    category: { id: '', name: 'Unknown', slug: 'unknown' },
    imageUrl: null,
  };
  let youGave = emptyItem;
  let youGot = emptyItem;
  if (offer) {
    const [offeredListing, requestedListing] = await Promise.all([
      repos.market.getListing(offer.offeredListingId),
      // An offer on an I NEED request has no listing on the other side; the
      // request itself is what that side of the trade is about.
      offer.requestedListingId
        ? repos.market.getListing(offer.requestedListingId)
        : offer.requestedNeedId
          ? repos.market.getNeed(offer.requestedNeedId)
          : Promise.resolve(null),
    ]);
    const toRef = (
      item: {
        id: string;
        title: string;
        type: ItemRef['type'];
        category: ItemRef['category'];
        images?: { objectKey: string; sortOrder: number }[];
      } | null,
    ): ItemRef =>
      item
        ? {
            id: item.id,
            title: item.title,
            type: item.type,
            category: item.category,
            imageUrl: coverImageUrl(item),
          }
        : emptyItem;
    // `offeredListingId` belongs to `fromUserId`; oriented to "me" below.
    const iAmSender = offer.fromUserId === meId;
    youGave = toRef(iAmSender ? offeredListing : requestedListing);
    youGot = toRef(iAmSender ? requestedListing : offeredListing);
  }

  const reviewed = await repos.reviews.findByTransactionAndReviewer(t.id, meId);
  const events = await repos.barterEngine.listEvents(t.id);
  const iAmInitiator = t.initiatedByUserId === meId;

  return {
    id: t.id,
    status: t.status as BarterTransactionView['status'],
    offerId: t.offerId,
    counterparty,
    youGave,
    youGot,
    reviewedByMe: reviewed !== null,
    confirmedByMe: (iAmInitiator ? t.initiatorConfirmedAt : t.counterpartyConfirmedAt) !== null,
    confirmedByCounterparty:
      (iAmInitiator ? t.counterpartyConfirmedAt : t.initiatorConfirmedAt) !== null,
    events: events.map((e) => ({
      type: e.type,
      actorIsMe: e.actorUserId === null ? null : e.actorUserId === meId,
      createdAt: e.createdAt,
    })),
    completedAt: t.completedAt,
    cancelledAt: t.cancelledAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
