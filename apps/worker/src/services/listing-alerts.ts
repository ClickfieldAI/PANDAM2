/**
 * Tells people who posted a matching request ("I NEED") that a new listing
 * exists. Opt-in by construction: only someone with a PUBLISHED need in the
 * listing's own category and type is ever told, only once per listing, never
 * more than MAX_LISTING_ALERTS people, never the owner, never anyone blocked
 * either way with the owner, and never someone who switched listing alerts off.
 * Like need alerts it cannot fail the author's own request.
 */
import { type ItemType } from '@pandam/types';
import { type Context } from 'hono';

import { type AppEnv } from '../types';

import { notify } from './notify';

export const MAX_LISTING_ALERTS = 25;

export interface ListingForAlert {
  id: string;
  ownerId: string;
  categoryId: string;
  type: ItemType;
  title: string;
}

export async function alertListingMatches(
  c: Context<AppEnv>,
  listing: ListingForAlert,
): Promise<number> {
  try {
    const { repos } = c.get('ctx');
    const needs = await repos.needs.listPublishedByCategoryType(listing.categoryId, listing.type);
    const hidden = await repos.blocks.relatedUserIds(listing.ownerId);
    const recipients: string[] = [];
    const seen = new Set<string>([listing.ownerId]);
    for (const n of needs) {
      if (recipients.length >= MAX_LISTING_ALERTS) break;
      if (seen.has(n.ownerId) || hidden.has(n.ownerId)) continue;
      seen.add(n.ownerId);
      recipients.push(n.ownerId);
    }

    let sent = 0;
    for (const userId of recipients) {
      if (!(await repos.notifications.getPreferences(userId)).listingAlerts) continue;
      await notify(c, {
        userId,
        type: 'listing_match',
        data: { listingId: listing.id },
        body: `“${listing.title.slice(0, 60)}” matches something you asked for.`,
      });
      sent += 1;
    }
    return sent;
  } catch (error) {
    console.warn('[listing-alerts] could not alert matching requesters', error);
    return 0;
  }
}
