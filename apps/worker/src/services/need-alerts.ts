/**
 * Tells people who have a matching listing that a new request has appeared.
 *
 * Called when a need becomes published. It never throws: a failure to alert
 * must not fail (or even slow the answer to) the author's own request, and the
 * in-app notification row is written before any push is attempted (see
 * `notify`). Each person is alerted at most once per request, so publishing,
 * pausing and re-publishing cannot spam them.
 */
import { type Context } from 'hono';

import { selectNeedAlertRecipients, type NeedForAlert } from '../domain/need-alerts';
import { type AppEnv } from '../types';

import { notify } from './notify';

function alertedNeedId(data: string | null): string | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { needId?: unknown };
    return typeof parsed.needId === 'string' ? parsed.needId : null;
  } catch {
    return null;
  }
}

export async function alertNeedMatches(c: Context<AppEnv>, need: NeedForAlert): Promise<number> {
  try {
    const { repos } = c.get('ctx');
    const listings = await repos.listings.listPublishedByCategoryType(need.categoryId, need.type);
    const recipients = selectNeedAlertRecipients(need, listings);

    let sent = 0;
    for (const userId of recipients) {
      const already = (await repos.notifications.listForUser(userId)).some(
        (n) => n.type === 'need_match' && alertedNeedId(n.data) === need.id,
      );
      if (already) continue;
      await notify(c, { userId, type: 'need_match', data: { needId: need.id } });
      sent += 1;
    }
    return sent;
  } catch (error) {
    console.warn('[need-alerts] could not alert matching owners', error);
    return 0;
  }
}
