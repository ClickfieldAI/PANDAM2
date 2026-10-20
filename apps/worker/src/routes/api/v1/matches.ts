/**
 * `/api/v1/matches` — deterministic reciprocal barter candidates for the
 * authenticated user, hydrated with titles / categories / owner names and
 * oriented as "you ↔ them". The user id comes from the verified session; a
 * caller can never list another user's matches. There is NO score and no AI.
 */
import { type ListingWithRefs, type NeedWithRefs } from '@pandam/database';
import { type MatchSide, type ReciprocalMatchView } from '@pandam/types';
import { Hono } from 'hono';

import {
  findReciprocalMatches,
  type MarketItem as MatchInput,
  type ReciprocalMatch,
} from '../../../domain/matching';
import { sendOk } from '../../../lib/http';
import { coverImageUrl, toOwner } from '../../../lib/serialize';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const matchesRoute = new Hono<AppEnv>();

matchesRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');

  const [allListings, needs] = await Promise.all([
    repos.listings.listAllPublished(),
    repos.needs.listAllPublished(),
  ]);
  // A `sale`-only listing has nothing to trade back — exclude it from
  // reciprocal matching (it can still be discovered and bought for money).
  const listings = allListings.filter((l) => l.transactionType !== 'sale');

  const toInput = (r: {
    id: string;
    ownerId: string;
    categoryId: string;
    type: MatchInput['type'];
  }): MatchInput => ({ id: r.id, ownerId: r.ownerId, categoryId: r.categoryId, type: r.type });

  const all = findReciprocalMatches(listings.map(toInput), needs.map(toInput));
  const hidden = await repos.blocks.relatedUserIds(user.id);
  const mine = all.filter((m) => {
    if (m.userAId !== user.id && m.userBId !== user.id) return false;
    const other = m.userAId === user.id ? m.userBId : m.userAId;
    return !hidden.has(other); // never match with someone blocked either way
  });

  if (mine.length === 0) return sendOk(c, { items: [] });

  const listingIds = new Set<string>();
  const needIds = new Set<string>();
  for (const m of mine) {
    listingIds.add(m.aListingId).add(m.bListingId);
    needIds.add(m.aNeedId).add(m.bNeedId);
  }
  const [listingMap, needMap] = await Promise.all([
    repos.market.listingsByIds([...listingIds]),
    repos.market.needsByIds([...needIds]),
  ]);

  const items = mine
    .map((m) => buildView(m, user.id, listingMap, needMap))
    .filter((v): v is ReciprocalMatchView => v !== null);

  return sendOk(c, { items });
});

type ListingMap = Map<string, ListingWithRefs>;
type NeedMap = Map<string, NeedWithRefs>;

function buildView(
  m: ReciprocalMatch,
  meId: string,
  listingMap: ListingMap,
  needMap: NeedMap,
): ReciprocalMatchView | null {
  const aListing = listingMap.get(m.aListingId);
  const bListing = listingMap.get(m.bListingId);
  const aNeed = needMap.get(m.aNeedId);
  const bNeed = needMap.get(m.bNeedId);
  if (!aListing || !bListing || !aNeed || !bNeed) return null;

  const sideA: MatchSide = {
    user: toOwner(aListing.owner),
    have: {
      id: aListing.id,
      title: aListing.title,
      type: aListing.type,
      category: aListing.category,
      imageUrl: coverImageUrl(aListing),
    },
    need: {
      id: aNeed.id,
      title: aNeed.title,
      type: aNeed.type,
      category: aNeed.category,
      imageUrl: coverImageUrl(aNeed),
    },
  };
  const sideB: MatchSide = {
    user: toOwner(bListing.owner),
    have: {
      id: bListing.id,
      title: bListing.title,
      type: bListing.type,
      category: bListing.category,
      imageUrl: coverImageUrl(bListing),
    },
    need: {
      id: bNeed.id,
      title: bNeed.title,
      type: bNeed.type,
      category: bNeed.category,
      imageUrl: coverImageUrl(bNeed),
    },
  };

  const youIsA = m.userAId === meId;
  return {
    key: `${m.aListingId}|${m.bNeedId}|${m.bListingId}|${m.aNeedId}`,
    you: youIsA ? sideA : sideB,
    them: youIsA ? sideB : sideA,
  };
}
