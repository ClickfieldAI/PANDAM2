import { type NotificationPage, type NotificationPreferences } from '@pandam/types';
import { type RegisterPushTokenInput } from '@pandam/validation';

import { api } from './client';

export const notificationsApi = {
  /** One page, newest first. Pass the previous page's `nextCursor` for the next one. */
  page: (opts: { cursor?: string | null; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.cursor) q.set('cursor', opts.cursor);
    if (opts.limit) q.set('limit', String(opts.limit));
    const s = q.toString();
    return api.get<NotificationPage>(`/api/v1/notifications${s ? `?${s}` : ''}`);
  },
  unreadCount: () => api.get<{ unreadCount: number }>('/api/v1/notifications/unread-count'),
  markRead: (id: string) =>
    api.post<{ read: true; unreadCount: number }>(`/api/v1/notifications/${id}/read`),
  markAllRead: () =>
    api.post<{ read: number; unreadCount: number }>('/api/v1/notifications/read-all'),
  preferences: () =>
    api.get<{ preferences: NotificationPreferences }>('/api/v1/notifications/preferences'),
  setPreferences: (patch: Partial<NotificationPreferences>) =>
    api.put<{ preferences: NotificationPreferences }>('/api/v1/notifications/preferences', patch),

  /** Register this installation for push; safe to call on every cold start. */
  registerPushToken: (input: RegisterPushTokenInput) =>
    api.post<{ registered: true }>('/api/v1/notifications/tokens', input),

  /** Called on sign-out so the next account on this phone is not pushed to. */
  unregisterPushToken: (input: RegisterPushTokenInput) =>
    api.delete<{ removed: true }>('/api/v1/notifications/tokens', input),
};
