/**
 * Who should hear about a newly published I NEED request.
 *
 * Pure and deterministic, like `matching.ts`: no scoring, no AI. A person is
 * worth alerting when they have a published listing in the request's own
 * category AND type that they could actually trade away. Sale-only listings
 * are excluded because an offer on a request must be backed by a barter-eligible
 * listing (see `POST /offers`), so alerting that owner would lead to a dead end.
 */
import { type ItemType } from '@pandam/types';

/** Most people alerted per request, so one post can never fan out to everyone. */
export const MAX_NEED_ALERTS = 25;

export interface NeedForAlert {
  id: string;
  ownerId: string;
  categoryId: string;
  type: ItemType;
}

export interface ListingForAlert {
  ownerId: string;
  categoryId: string;
  type: ItemType;
  transactionType: 'barter' | 'sale' | 'both';
}

/**
 * Distinct owner ids to alert, in first-seen order, capped at `max`. The
 * request's own author is never included, and a person with several matching
 * listings is still alerted once.
 */
export function selectNeedAlertRecipients(
  need: NeedForAlert,
  listings: ListingForAlert[],
  max: number = MAX_NEED_ALERTS,
): string[] {
  const recipients: string[] = [];
  const seen = new Set<string>([need.ownerId]);
  for (const l of listings) {
    if (recipients.length >= max) break;
    if (l.categoryId !== need.categoryId || l.type !== need.type) continue;
    if (l.transactionType === 'sale') continue;
    if (seen.has(l.ownerId)) continue;
    seen.add(l.ownerId);
    recipients.push(l.ownerId);
  }
  return recipients;
}
