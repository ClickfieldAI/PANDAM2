/**
 * `/api/v1/blocks` — people the caller has blocked. Private to the caller.
 *
 *   GET    /          who I have blocked (the other direction is never exposed)
 *   PUT    /:userId   block someone (idempotent); withdraws pending offers between us
 *   DELETE /:userId   lift a block I placed (idempotent)
 *
 * Enforcement lives where the interaction happens (offers, counters, accepting,
 * messages, discovery, detail pages, recommendations, matches, need alerts) —
 * see `services/blocks.ts`.
 */
import { type BlockedUserView } from '@pandam/types';
import { Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { toOwnerRef } from '../../../lib/serialize';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const blocksRoute = new Hono<AppEnv>();

blocksRoute.use('*', authMiddleware, requireAuth);

blocksRoute.get('/', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const rows = await repos.blocks.listBlockedBy(user.id);
  const items: BlockedUserView[] = await Promise.all(
    rows.map(async (r) => ({
      user: toOwnerRef(r.blockedId, await repos.profiles.findByUserId(r.blockedId)),
      blockedAt: r.createdAt,
    })),
  );
  return sendOk(c, { items });
});

blocksRoute.put('/:userId', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const targetId = c.req.param('userId');
  if (targetId === user.id) throw new ApiError('unprocessable', 'You cannot block yourself.');
  const target = await repos.users.findById(targetId);
  if (!target) throw new ApiError('not_found', 'That person does not exist.');

  await repos.blocks.block(user.id, target.id);
  // Offers that were still waiting for an answer between you two are closed.
  // The other person is not notified.
  const withdrawn = await repos.offers.cancelPendingBetween(user.id, target.id);
  return sendOk(c, { blocked: true, userId: target.id, withdrawnOffers: withdrawn.length });
});

blocksRoute.delete('/:userId', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  await repos.blocks.unblock(user.id, c.req.param('userId'));
  return sendOk(c, { blocked: false, userId: c.req.param('userId') });
});
