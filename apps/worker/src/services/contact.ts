/**
 * Who may call / WhatsApp whom.
 *
 * A mobile number is private. It is released to the OTHER party of one specific trade, and only
 * while that trade is live: the offer was accepted by the recipient AND its barter transaction
 * is still active. Everything else — a pending, rejected, cancelled or expired offer, a
 * cancelled or completed transaction, an archived chat, a block either way, a suspended
 * account — grants nothing. Accepting one trade never reveals anyone's number for another.
 *
 * Message-only access before acceptance needs no rule here: a conversation does not exist
 * until the offer is accepted, so there is no chat (and so no contact) at all before then.
 */
import { type Context } from 'hono';

import { type AppEnv } from '../types';

type Ctx = Context<AppEnv>;

/** Transaction states in which the two people still have a deal to arrange. */
const LIVE_TRANSACTION: readonly string[] = ['created', 'in_progress', 'disputed'];

export type ContactDenial =
  | 'no_offer'
  | 'offer_not_accepted'
  | 'no_transaction'
  | 'transaction_not_active'
  | 'conversation_archived'
  | 'blocked'
  | 'unavailable';

export type ContactAccess =
  { allowed: true; otherUserId: string } | { allowed: false; reason: ContactDenial };

export async function contactAccess(
  c: Ctx,
  conversation: { id: string; offerId: string | null; status: string },
  meId: string,
): Promise<ContactAccess> {
  const { repos } = c.get('ctx');
  if (conversation.status !== 'active') return { allowed: false, reason: 'conversation_archived' };
  if (!conversation.offerId) return { allowed: false, reason: 'no_offer' };

  const offer = await repos.offers.findById(conversation.offerId);
  if (!offer) return { allowed: false, reason: 'no_offer' };
  if (offer.status !== 'accepted') return { allowed: false, reason: 'offer_not_accepted' };
  // The caller must be one of the two people the offer is between.
  if (offer.fromUserId !== meId && offer.toUserId !== meId) {
    return { allowed: false, reason: 'unavailable' };
  }

  const transaction = await repos.barterTransactions.findByOffer(offer.id);
  if (!transaction) return { allowed: false, reason: 'no_transaction' };
  if (!LIVE_TRANSACTION.includes(transaction.status)) {
    return { allowed: false, reason: 'transaction_not_active' };
  }

  const otherUserId = offer.fromUserId === meId ? offer.toUserId : offer.fromUserId;
  const other = await repos.users.findById(otherUserId);
  if (!other || other.status !== 'active') return { allowed: false, reason: 'unavailable' };
  const rel = await repos.blocks.relation(meId, otherUserId);
  if (rel.iBlocked || rel.theyBlocked) return { allowed: false, reason: 'blocked' };

  return { allowed: true, otherUserId };
}
