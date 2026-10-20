/**
 * `/api/v1/favourites` — the caller's saved listings. Private to the caller:
 * there is no way to read or change anyone else's.
 *
 *   GET    /               saved listings, newest save first (any status, so the
 *                          app can show "no longer available" instead of silently
 *                          dropping an item)
 *   GET    /ids            just the saved listing ids (one cheap call lets every
 *                          heart in the app render the right state)
 *   PUT    /:listingId     save (idempotent)
 *   DELETE /:listingId     unsave (idempotent)
 */
import { Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { toMarketItem } from '../../../lib/serialize';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

export const favouritesRoute = new Hono<AppEnv>();

/** A generous cap: nobody saves this many by hand, and it bounds the query. */
const MAX_SAVED = 200;

favouritesRoute.use('*', authMiddleware, requireAuth);

favouritesRoute.get('/ids', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  return sendOk(c, { ids: await repos.favourites.listIds(user.id, MAX_SAVED) });
});

favouritesRoute.get('/', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const ids = await repos.favourites.listIds(user.id, MAX_SAVED);
  const found = await repos.market.listingsByIds(ids);
  const hidden = await repos.blocks.relatedUserIds(user.id);
  // Keep the save order; a listing that was hard-deleted is already gone (the
  // row cascades), and a soft-deleted one is hidden.
  const items = ids
    .map((id) => found.get(id))
    .filter((row): row is NonNullable<typeof row> => !!row && !hidden.has(row.ownerId))
    .map((row) => toMarketItem(row, 'listing'));
  return sendOk(c, { items });
});

favouritesRoute.put('/:listingId', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const listingId = c.req.param('listingId');

  const listing = await repos.listings.findById(listingId);
  if (!listing || listing.deletedAt !== null) {
    throw new ApiError('not_found', 'That listing does not exist.');
  }
  if (listing.ownerId === user.id) {
    throw new ApiError('unprocessable', 'You cannot save your own listing.');
  }
  if ((await repos.blocks.relatedUserIds(user.id)).has(listing.ownerId)) {
    throw new ApiError('not_found', 'That listing does not exist.');
  }
  if (listing.status !== 'published') {
    throw new ApiError('unprocessable', 'That listing is not available to save.');
  }
  const added = await repos.favourites.add(user.id, listing.id);
  // Tell the owner someone saved their listing (no name; once per saver per listing).
  if (added) {
    // A failure to notify must never undo or fail the save itself.
    await notify(c, {
      userId: listing.ownerId,
      type: 'listing_saved',
      data: { listingId: listing.id },
      dedupeKey: `listing_saved|${listing.id}|${user.id}`,
      body: `Someone saved “${listing.title.slice(0, 60)}”.`,
    }).catch((error) => console.warn('[favourites] notify failed', error));
  }
  return sendOk(c, { saved: true, listingId: listing.id });
});

favouritesRoute.delete('/:listingId', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  await repos.favourites.remove(user.id, c.req.param('listingId'));
  return sendOk(c, { saved: false, listingId: c.req.param('listingId') });
});
