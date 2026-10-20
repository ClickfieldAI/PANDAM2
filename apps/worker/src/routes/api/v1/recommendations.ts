/**
 * `/api/v1/recommendations` — "Recommended For You": a personalized,
 * deterministic, rule-based ranking of currently-available listings. See
 * `domain/recommendations.ts` for the actual scoring algorithm; this route
 * only does I/O — reading the user's existing behaviour history and the
 * existing candidate pool, then handing both to that pure module.
 *
 *   GET /    personalized (or cold-start fallback) listing recommendations
 *
 * Deliberately NOT a new system: every signal here is read from tables that
 * already exist for other reasons (item_views, offers, barter_transactions),
 * and "available" means exactly what `GET /api/v1/listings` means — the same
 * `discoverListings` read model Home and Discover already use. Nothing is
 * written here; there is no new "preference profile" table, because the
 * profile is cheap enough to derive fresh on every call (at most a few
 * hundred historical rows plus `MAX_CANDIDATES` listings) and a derived
 * value that can silently drift from its source is a worse bug than a
 * recompute.
 */
import { Hono } from 'hono';

import {
  type BehaviorSignal,
  MAX_CANDIDATES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_PERSONALIZATION_WEIGHT,
  buildPreferenceProfile,
  scoreCandidate,
} from '../../../domain/recommendations';
import { sendOk } from '../../../lib/http';
import { toMarketItem } from '../../../lib/serialize';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const recommendationsRoute = new Hono<AppEnv>();

recommendationsRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const now = Date.now();

  const limitParam = Number(c.req.query('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.trunc(limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;

  // ------------------------------------------------------- behaviour history --
  // Three existing sources, none of them new tracking: unique-viewer log,
  // sent offers (interest/accepted), completed trades. Everything resolves
  // to "which listing, which tier, when" — `domain/recommendations.ts` does
  // the actual weighting.
  const [views, outgoingOffers, completedTrades] = await Promise.all([
    repos.itemViews.listForUser(user.id, 'listing'),
    repos.offers.listOutgoing(user.id),
    repos.barterTransactions.listCompletedForUser(user.id),
  ]);

  const referencedListingIds = new Set<string>();
  for (const v of views) referencedListingIds.add(v.itemId);
  for (const o of outgoingOffers)
    if (o.requestedListingId) referencedListingIds.add(o.requestedListingId);
  for (const t of completedTrades)
    if (t.requestedListingId) referencedListingIds.add(t.requestedListingId);

  const referencedListings = await repos.market.listingsByIds([...referencedListingIds]);

  const signals: BehaviorSignal[] = [];
  for (const v of views) {
    const item = referencedListings.get(v.itemId);
    if (!item) continue; // a since-deleted/unreadable row — skip, nothing to score against
    signals.push({
      listingId: item.id,
      categoryId: item.categoryId,
      type: item.type,
      priceAmount: item.pricing.priceAmount,
      occurredAt: v.createdAt,
      tier: 'view',
    });
  }
  for (const o of outgoingOffers) {
    if (!o.requestedListingId) continue; // an "I NEED" offer — no listing to attribute this to
    const item = referencedListings.get(o.requestedListingId);
    if (!item) continue;
    const accepted = o.status === 'accepted';
    signals.push({
      listingId: item.id,
      categoryId: item.categoryId,
      type: item.type,
      priceAmount: item.pricing.priceAmount,
      occurredAt: (accepted ? o.respondedAt : null) ?? o.createdAt,
      tier: accepted ? 'accepted' : 'interest',
    });
  }
  for (const t of completedTrades) {
    if (!t.requestedListingId) continue;
    const item = referencedListings.get(t.requestedListingId);
    if (!item) continue;
    signals.push({
      listingId: item.id,
      categoryId: item.categoryId,
      type: item.type,
      priceAmount: item.pricing.priceAmount,
      occurredAt: t.completedAt ?? now,
      tier: 'traded',
    });
  }

  const profile = buildPreferenceProfile(signals, now);

  // ------------------------------------------------------- candidate pool --
  // The exact same "available" definition Home/Discover use: published only.
  // Draft/paused/traded/archived listings never reach `discoverListings` in
  // the first place — there is no second definition of "available" here.
  // Blocked people (either way) are never recommended.
  const hidden = await repos.blocks.relatedUserIds(user.id);
  const candidates = await repos.market.discoverListings({
    limit: MAX_CANDIDATES,
    excludeOwnerIds: [...hidden],
  });
  const eligible = candidates.filter((item) => item.ownerId !== user.id);

  const scored = eligible
    .map((item) => scoreCandidate(item, profile, now))
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .slice(0, limit);

  return sendOk(c, {
    items: scored.map((s) => ({ ...toMarketItem(s.item, 'listing'), reason: s.reason })),
    personalized: profile.totalWeight >= MIN_PERSONALIZATION_WEIGHT,
  });
});
