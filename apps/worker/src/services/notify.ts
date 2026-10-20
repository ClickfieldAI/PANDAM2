/**
 * The one way the API tells a user something happened.
 *
 * `notify()` always writes the durable `notifications` row first, then tries
 * to deliver a push copy to that user's registered devices. The row is the
 * product's source of truth (the in-app feed reads it, and the unread badge
 * counts it); the push is best-effort and never allowed to fail the request
 * that caused it — a user whose phone is off must still see the offer when
 * they next open the app.
 *
 * Every route that used to call `repos.notifications.create` directly goes
 * through here instead, so copy and delivery stay in one place rather than
 * drifting per route.
 */
import { type NotificationType } from '@pandam/database/enums';
import { type Context } from 'hono';

import { type PushMessage, sendExpoPush } from '../lib/push';
import { type AppEnv } from '../types';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** Related ids; stored as JSON and sent to the device for deep-linking. */
  data?: Record<string, string>;
  /**
   * Overrides for the push copy. Useful where the default sentence would be
   * vaguer than it needs to be (e.g. naming the person who made the offer).
   */
  title?: string;
  body?: string;
  /** Override the automatic event identity (type + related ids). */
  dedupeKey?: string;
}

/**
 * Default push copy per notification type. Deliberately free of names and
 * item titles: a lock-screen notification is visible to anyone holding the
 * phone, so the detail lives behind the tap, in the app.
 */
const COPY: Record<NotificationType, { title: string; body: string }> = {
  offer_received: { title: 'New trade offer', body: 'Someone wants to swap with you.' },
  offer_accepted: {
    title: 'Offer accepted',
    body: 'Your trade is on — open the chat to arrange it.',
  },
  offer_rejected: { title: 'Offer declined', body: 'That trade offer was declined.' },
  offer_cancelled: { title: 'Offer withdrawn', body: 'That trade offer was withdrawn.' },
  offer_expired: { title: 'Offer expired', body: 'A trade offer expired before it was answered.' },
  offer_countered: {
    title: 'Counter offer',
    body: 'They answered your offer with a different swap.',
  },
  message_received: { title: 'New message', body: 'You have a new message about a trade.' },
  transaction_updated: { title: 'Trade updated', body: 'One of your trades changed status.' },
  review_received: { title: 'New review', body: 'Someone left you a review.' },
  review_reminder: { title: 'Leave a review', body: 'How did your last trade go?' },
  moderation_notice: {
    title: 'Update on your listing',
    body: 'A PANDAM moderator removed one of your posts. Open the app for details.',
  },
  report_update: { title: 'Report update', body: 'A report you filed has been reviewed.' },
  need_match: {
    title: 'Someone needs something you have',
    body: 'A new request matches an item you listed.',
  },
  listing_match: {
    title: 'New listing for something you need',
    body: 'A new listing matches a request you posted.',
  },
  listing_saved: {
    title: 'Someone saved your listing',
    body: 'Your listing was added to a saved list.',
  },
};

/**
 * What makes this event THE SAME event: its type plus its related ids. A retried
 * request therefore produces the same key and is dropped by the unique index.
 * (`message_received` carries the message id; `transaction_updated` the status.)
 */
export function eventKey(input: Pick<NotifyInput, 'type' | 'data' | 'dedupeKey'>): string {
  if (input.dedupeKey) return input.dedupeKey;
  const parts = Object.entries(input.data ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${input.type}|${parts.join('&')}`;
}

/**
 * Write the notification and push it. Push happens inside `waitUntil` where
 * the runtime provides it, so the HTTP response is not held up waiting on
 * Expo; in tests (no `executionCtx`) it is simply awaited.
 */
export async function notify(c: Context<AppEnv>, input: NotifyInput): Promise<void> {
  const { repos } = c.get('ctx');

  const copy = COPY[input.type];
  const stored = await repos.notifications.create({
    userId: input.userId,
    type: input.type,
    data: input.data ?? null,
    title: input.title ?? copy.title,
    body: input.body ?? copy.body,
    dedupeKey: eventKey(input),
  });
  // The same event was already recorded (a retried request): neither a second
  // row nor a second push.
  if (!stored) return;

  const deliver = pushToUser(c, input);
  try {
    c.executionCtx.waitUntil(deliver);
  } catch {
    // No execution context (unit tests, direct `app.request` calls): just run
    // it. `pushToUser` swallows its own failures, so this cannot reject.
    await deliver;
  }
}

/** Fan one notification out to every live device the user has registered. */
async function pushToUser(c: Context<AppEnv>, input: NotifyInput): Promise<void> {
  try {
    const { repos } = c.get('ctx');
    // Push is a convenience copy: respect the user's switch. The in-app row exists regardless.
    if (!(await repos.notifications.getPreferences(input.userId)).pushEnabled) return;
    const tokens = await repos.pushTokens.listActiveForUser(input.userId);
    if (tokens.length === 0) return;

    const copy = COPY[input.type];
    // The badge is the user's real unread count, so clearing notifications in
    // the app and the number on the icon cannot disagree.
    const unread = await repos.notifications.unreadCount(input.userId);

    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: input.title ?? copy.title,
      body: input.body ?? copy.body,
      data: { type: input.type, ...(input.data ?? {}) },
      badge: unread,
    }));

    const { deadTokens } = await sendExpoPush(messages, c.env.EXPO_ACCESS_TOKEN);
    await Promise.all(deadTokens.map((token) => repos.pushTokens.disableByToken(token)));
  } catch (error) {
    console.warn('[notify] push delivery failed', error);
  }
}
