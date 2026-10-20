/**
 * `/api/v1/notifications` — per-user notification feed, read state, and Expo
 * push registration. Email delivery is still a later phase.
 *
 *   GET  /               a page of the caller's notifications (`?unread=true&limit=&cursor=`)
 *   GET  /unread-count   just the badge number
 *   GET|PUT /preferences push / listing-alert switches
 *   POST /read-all       mark every notification read
 *   POST /:id/read       mark one notification read
 *   POST /tokens         register this device for push
 *   DELETE /tokens       unregister it (called on sign-out)
 *
 * The rows here are the source of truth; a push is only ever a copy of one
 * (see `services/notify.ts`), so a user with push disabled loses nothing but
 * the interruption.
 */
import { type NotificationView } from '@pandam/types';
import { notificationPreferencesSchema, registerPushTokenSchema } from '@pandam/validation';
import { Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const notificationsRoute = new Hono<AppEnv>();

const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;

const encodeCursor = (n: { createdAt: number; id: string }) => `${n.createdAt}_${n.id}`;
function decodeCursor(raw: string | undefined) {
  if (!raw) return undefined;
  const m = /^(\d{1,15})_(ntf_[0-9a-f]{32})$/.exec(raw);
  if (!m) throw new ApiError('validation_error', 'That cursor is not valid.');
  return { createdAt: Number(m[1]), id: m[2]! };
}

function safeData(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

notificationsRoute.get('/', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const unreadOnly = c.req.query('unread') === 'true';
  const limitRaw = c.req.query('limit');
  const limit = Math.min(
    PAGE_MAX,
    Math.max(
      1,
      limitRaw === undefined ? PAGE_DEFAULT : Number.parseInt(limitRaw, 10) || PAGE_DEFAULT,
    ),
  );
  const before = decodeCursor(c.req.query('cursor'));
  // One extra row tells us whether there is another page.
  const rows = await repos.notifications.listPage(user.id, {
    unreadOnly,
    limit: limit + 1,
    before,
  });
  const page = rows.slice(0, limit);
  const items: NotificationView[] = page.map((n) => ({
    id: n.id,
    type: n.type,
    data: safeData(n.data),
    title: n.title,
    body: n.body,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  }));
  return sendOk(c, {
    items,
    nextCursor: rows.length > limit && page.length ? encodeCursor(page[page.length - 1]!) : null,
    unreadCount: await repos.notifications.unreadCount(user.id),
  });
});

notificationsRoute.get('/unread-count', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  return sendOk(c, { unreadCount: await c.get('ctx').repos.notifications.unreadCount(user.id) });
});

notificationsRoute.get('/preferences', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  return sendOk(c, { preferences: await c.get('ctx').repos.notifications.getPreferences(user.id) });
});

notificationsRoute.put('/preferences', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const patch = await parseBody(c, notificationPreferencesSchema);
  const preferences = await c.get('ctx').repos.notifications.setPreferences(user.id, patch);
  return sendOk(c, { preferences });
});

notificationsRoute.post('/read-all', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const read = await repos.notifications.markAllRead(user.id);
  return sendOk(c, { read, unreadCount: 0 });
});

/**
 * Register this installation for push. Idempotent: the same token re-posted
 * (every cold start does this) updates the existing row rather than piling up
 * duplicates that would push the same phone twice.
 */
notificationsRoute.post('/tokens', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, registerPushTokenSchema);
  await repos.pushTokens.register({ userId: user.id, ...input });
  return sendOk(c, { registered: true }, 201);
});

/** Sign-out on this device: stop pushing to it. */
notificationsRoute.delete('/tokens', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, registerPushTokenSchema);
  await repos.pushTokens.removeByToken(user.id, input.token);
  return sendOk(c, { removed: true });
});

notificationsRoute.post('/:id/read', authMiddleware, requireAuth, async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  // Scoped to the caller inside the repository: someone else's id is simply "not found".
  const notification = await repos.notifications.markReadForUser(c.req.param('id'), user.id);
  if (!notification) throw new ApiError('not_found', 'That notification does not exist.');
  return sendOk(c, { read: true, unreadCount: await repos.notifications.unreadCount(user.id) });
});
