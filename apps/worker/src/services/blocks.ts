/**
 * Blocking rules. A block works in BOTH directions: if either person has
 * blocked the other, neither can send the other offers or messages, and
 * neither sees the other's listings or requests. Only the blocker can see or
 * lift the block, and the blocked person is never told it exists — the message
 * they get is deliberately the same as "this person isn't available".
 *
 * Blocking does NOT touch a trade that is already underway (the items are
 * committed; either side can still confirm or cancel it) — it only stops new
 * contact, and withdraws offers that were still waiting for an answer.
 */
import { type Context } from 'hono';

import { ApiError } from '../lib/http';
import { type AppEnv } from '../types';

type Ctx = Context<AppEnv>;

/** Throw if the two people may not interact. The wording never reveals who blocked whom to the blocked person. */
export async function assertCanInteract(c: Ctx, meId: string, otherId: string): Promise<void> {
  const { repos } = c.get('ctx');
  // A suspended (or removed) account cannot be dealt with. Same wording as a block
  // from their side: nothing about why is revealed to the other person.
  const other = await repos.users.findById(otherId);
  if (!other || other.status !== 'active') {
    throw new ApiError('forbidden', 'This person is not available.');
  }
  const rel = await repos.blocks.relation(meId, otherId);
  if (rel.iBlocked) {
    throw new ApiError('forbidden', 'You have blocked this person. Unblock them to interact.');
  }
  if (rel.theyBlocked) {
    throw new ApiError('forbidden', 'This person is not available.');
  }
}

/** Everyone whose items the viewer must not see (blocked either way). */
export async function hiddenOwnerIds(c: Ctx, meId: string | null): Promise<Set<string>> {
  if (!meId) return new Set();
  return c.get('ctx').repos.blocks.relatedUserIds(meId);
}
