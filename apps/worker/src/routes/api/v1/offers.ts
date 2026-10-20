/**
 * `/api/v1/offers` — barter proposals between two users: "I give you my HAVE
 * for your HAVE". No money anywhere in this file — see `payments.ts` for that.
 *
 *   POST /attachments  upload an optional photo for an offer (auth)
 *   POST /             propose a trade for a listing OR an I NEED request (auth)
 *   GET  /incoming     offers sent TO the caller (auth)
 *   GET  /outgoing     offers the caller SENT (auth)
 *   GET  /:id          one offer (a party to it only)
 *   POST /:id/respond  accept / reject (recipient) / cancel (sender)
 *
 * Sending an offer does NOT open a conversation — the two people cannot chat
 * until the recipient accepts. Rejecting or cancelling leaves no conversation
 * at all. Accepting creates both the `barter_transactions` row and the
 * conversation (or reuses one from an older offer that still has it).
 */
import { type ItemRef, type OfferView } from '@pandam/types';
import { counterOfferSchema, createOfferSchema, respondToOfferSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { mediaUrl, readUploadedImage, requireMedia } from '../../../lib/media';
import { coverImageUrl, toOwnerRef } from '../../../lib/serialize';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import {
  acceptOffer,
  closeOffer,
  counterOffer,
  ensureAcceptanceFinalized,
} from '../../../services/barter';
import { assertCanInteract } from '../../../services/blocks';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const offersRoute = new Hono<AppEnv>();

/**
 * Upload the optional photo for an offer BEFORE creating it; returns the key
 * to pass as `imageKey`. Keys are scoped to the uploader (`offers/<userId>/`)
 * and random, and the create step only accepts the caller's own prefix.
 */
offersRoute.post('/attachments', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const bucket = requireMedia(c.env);
  const { bytes, contentType, extension } = await readUploadedImage(c.req.raw);
  const key = `offers/${user.id}/${crypto.randomUUID()}.${extension}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
  return sendOk(c, { imageKey: key, imageUrl: mediaUrl(key) }, 201);
});

offersRoute.post('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, createOfferSchema);

  if (input.expiresAt !== undefined && input.expiresAt <= Date.now()) {
    throw new ApiError('unprocessable', 'An offer must expire in the future.');
  }

  // Retry safety: a repeat of the same request (same Idempotency-Key) returns
  // the offer it already created instead of creating a second one.
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim() || null;
  if (idempotencyKey !== null && (idempotencyKey.length < 8 || idempotencyKey.length > 80)) {
    throw new ApiError('bad_request', 'Idempotency-Key must be 8-80 characters.');
  }
  if (idempotencyKey) {
    const replay = await repos.offers.findByIdempotencyKey(user.id, idempotencyKey);
    if (replay) {
      if (
        replay.offeredListingId !== input.offeredListingId ||
        (replay.requestedListingId ?? null) !== (input.requestedListingId ?? null) ||
        (replay.requestedNeedId ?? null) !== (input.requestedNeedId ?? null)
      ) {
        throw new ApiError(
          'conflict',
          'That Idempotency-Key was already used for a different offer.',
        );
      }
      return sendOk(c, { offer: await hydrate(c, replay, user.id) }, 200);
    }
  }

  const offered = await repos.listings.findById(input.offeredListingId);
  if (!offered || offered.status !== 'published' || offered.ownerId !== user.id) {
    throw new ApiError('unprocessable', 'You can only offer your own published listing.');
  }
  if (offered.transactionType === 'sale') {
    throw new ApiError('unprocessable', 'A sale-only listing cannot be part of a barter offer.');
  }

  // The recipient is ALWAYS the owner of the requested item, never taken
  // from the request body. A supplied `toUserId` is only cross-checked.
  let toUserId: string;
  if (input.requestedListingId) {
    const requested = await repos.listings.findById(input.requestedListingId);
    if (!requested || requested.status !== 'published') {
      throw new ApiError('unprocessable', 'That listing is not available for trade.');
    }
    if (requested.transactionType === 'sale') {
      throw new ApiError('unprocessable', 'A sale-only listing cannot be part of a barter offer.');
    }
    toUserId = requested.ownerId;
  } else {
    const need = await repos.needs.findById(input.requestedNeedId!);
    if (!need || need.status !== 'published') {
      throw new ApiError('unprocessable', 'That request is not open any more.');
    }
    toUserId = need.ownerId;
  }
  if (input.toUserId && input.toUserId !== toUserId) {
    throw new ApiError('unprocessable', 'That item belongs to someone else.');
  }
  if (toUserId === user.id) {
    throw new ApiError('unprocessable', 'You cannot send an offer to yourself.');
  }
  await assertCanInteract(c, user.id, toUserId);
  if (input.imageKey && !input.imageKey.startsWith(`offers/${user.id}/`)) {
    throw new ApiError('forbidden', 'That image does not belong to you.');
  }
  const duplicate = await repos.offers.findPendingDuplicate(
    user.id,
    input.requestedListingId ?? null,
    input.requestedNeedId ?? null,
  );
  if (duplicate) {
    throw new ApiError('unprocessable', 'You already have a pending request for this item.');
  }
  // `matchId` is not cross-checked against a persisted `matches` row: the
  // deterministic matches this app shows today are computed on the fly (see
  // `routes/api/v1/matches.ts`) and never written to that table.

  let created;
  try {
    created = await repos.offers.create({
      idempotencyKey,
      matchId: input.matchId ?? null,
      fromUserId: user.id,
      toUserId,
      offeredListingId: input.offeredListingId,
      requestedListingId: input.requestedListingId ?? null,
      requestedNeedId: input.requestedNeedId ?? null,
      imageKey: input.imageKey ?? null,
      message: input.message ?? null,
      expiresAt: input.expiresAt ?? null,
    });
  } catch (error) {
    // The database is the final arbiter: two racing requests can both pass the
    // read-based checks above, but only one can insert (unique indexes).
    if (
      error instanceof Error &&
      /UNIQUE|constraint/i.test(error.message + String(error.cause ?? ''))
    ) {
      const replay = idempotencyKey
        ? await repos.offers.findByIdempotencyKey(user.id, idempotencyKey)
        : null;
      if (replay) return sendOk(c, { offer: await hydrate(c, replay, user.id) }, 200);
      throw new ApiError('unprocessable', 'You already have a pending request for this item.');
    }
    throw error;
  }

  // No conversation yet — the recipient has to accept before either side can
  // message the other (see `POST /:id/respond`).
  await notify(c, {
    userId: toUserId,
    type: 'offer_received',
    data: { offerId: created.id },
  });

  return sendOk(c, { offer: await hydrate(c, created, user.id) }, 201);
});

offersRoute.get('/incoming', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const status = parseStatusFilter(c);
  const rows = await repos.offers.listIncoming(user.id, status);
  return sendOk(c, { items: await Promise.all(rows.map((o) => hydrate(c, o, user.id))) });
});

offersRoute.get('/outgoing', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const status = parseStatusFilter(c);
  const rows = await repos.offers.listOutgoing(user.id, status);
  return sendOk(c, { items: await Promise.all(rows.map((o) => hydrate(c, o, user.id))) });
});

offersRoute.get('/:id', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(c.req.param('id'));
  if (!offer || (offer.fromUserId !== user.id && offer.toUserId !== user.id)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  // Self-heal: an accept that crashed after its compare-and-swap but before
  // its follow-up writes is completed the next time anyone reads the offer.
  if (offer.status === 'accepted' && !(await repos.barterTransactions.findByOffer(offer.id))) {
    await ensureAcceptanceFinalized(c, offer);
  }
  return sendOk(c, { offer: await hydrate(c, offer, user.id) });
});

offersRoute.post('/:id/respond', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  // Existence + party check first so a stranger can never learn an offer exists.
  const existing = await repos.offers.findById(c.req.param('id'));
  if (!existing || (existing.fromUserId !== user.id && existing.toUserId !== user.id)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  const { action } = await parseBody(c, respondToOfferSchema);

  // All state changes go through the barter service: compare-and-swap writes,
  // idempotent retries, expiry and availability checks (see services/barter.ts).
  if (action === 'accept') {
    await acceptOffer(c, existing.id, user.id);
  } else {
    await closeOffer(c, existing.id, user.id, action === 'reject' ? 'reject' : 'cancel');
  }

  const updated = await repos.offers.findById(existing.id);
  return sendOk(c, { offer: await hydrate(c, updated!, user.id) });
});

offersRoute.post('/:id/counter', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const input = await parseBody(c, counterOfferSchema);
  const counter = await counterOffer(c, c.req.param('id'), user.id, input);
  return sendOk(c, { offer: await hydrate(c, counter, user.id) }, 201);
});

/** The whole negotiation this offer belongs to, oldest first. Parties only. */
offersRoute.get('/:id/history', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const offer = await repos.offers.findById(c.req.param('id'));
  if (!offer || (offer.fromUserId !== user.id && offer.toUserId !== user.id)) {
    throw new ApiError('not_found', 'That offer does not exist.');
  }
  const chain = await repos.offers.findChain(offer.id);
  return sendOk(c, { items: await Promise.all(chain.map((o) => hydrate(c, o, user.id))) });
});

function parseStatusFilter(c: Context<AppEnv>) {
  const raw = c.req.query('status');
  const allowed = ['pending', 'accepted', 'rejected', 'cancelled', 'expired', 'countered'] as const;
  return allowed.includes(raw as (typeof allowed)[number])
    ? (raw as (typeof allowed)[number])
    : undefined;
}

async function hydrate(
  c: Context<AppEnv>,
  offer: {
    id: string;
    status: string;
    fromUserId: string;
    toUserId: string;
    offeredListingId: string;
    requestedListingId: string | null;
    requestedNeedId: string | null;
    imageKey: string | null;
    message: string | null;
    matchId: string | null;
    parentOfferId: string | null;
    expiresAt: number | null;
    respondedAt: number | null;
    createdAt: number;
    updatedAt: number;
  },
  meId: string,
): Promise<OfferView> {
  const { repos } = c.get('ctx');
  const [fromProfile, toProfile, offeredListing, requestedItem, conversation, counterChild] =
    await Promise.all([
      repos.profiles.findByUserId(offer.fromUserId),
      repos.profiles.findByUserId(offer.toUserId),
      repos.market.getListing(offer.offeredListingId),
      offer.requestedListingId
        ? repos.market.getListing(offer.requestedListingId)
        : repos.market.getNeed(offer.requestedNeedId!),
      repos.conversations.findByOffer(offer.id),
      offer.status === 'countered' ? repos.offers.findChildOf(offer.id) : Promise.resolve(null),
    ]);

  const toItemRef = (
    id: string,
    item: {
      title: string;
      type: string;
      category: { id: string; name: string; slug: string };
      images?: { objectKey: string; sortOrder: number }[];
    } | null,
  ): ItemRef => ({
    id,
    title: item?.title ?? 'No longer available',
    type: (item?.type ?? 'product') as ItemRef['type'],
    category: item?.category ?? { id: '', name: 'Unknown', slug: 'unknown' },
    imageUrl: coverImageUrl(item),
  });

  return {
    id: offer.id,
    status: offer.status as OfferView['status'],
    isMine: offer.fromUserId === meId,
    fromUser: toOwnerRef(offer.fromUserId, fromProfile),
    toUser: toOwnerRef(offer.toUserId, toProfile),
    offered: toItemRef(offer.offeredListingId, offeredListing),
    requested: toItemRef(offer.requestedListingId ?? offer.requestedNeedId!, requestedItem),
    requestedKind: offer.requestedListingId ? 'listing' : 'need',
    imageUrl: offer.imageKey ? mediaUrl(offer.imageKey) : null,
    conversationId: conversation?.id ?? null,
    message: offer.message,
    matchId: offer.matchId,
    parentOfferId: offer.parentOfferId,
    counterOfferId: counterChild?.id ?? null,
    expiresAt: offer.expiresAt,
    respondedAt: offer.respondedAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}
