/** TanStack Query hooks for the notification feed. The server is the only source of truth. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { type NotificationPreferences } from '@pandam/types';

import { notificationsApi } from '@/lib/api/notifications';

const FEED = ['notifications', 'feed'] as const;
const COUNT = ['notifications', 'count'] as const;
const PREFS = ['notifications', 'preferences'] as const;

/** The history, newest first, loaded a page at a time. */
export function useNotificationFeed() {
  return useInfiniteQuery({
    queryKey: FEED,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => notificationsApi.page({ cursor: pageParam, limit: 30 }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

/** The badge number. A cheap count, not the whole feed. */
export function useUnreadNotificationCount() {
  const q = useQuery({
    queryKey: COUNT,
    queryFn: async () => (await notificationsApi.unreadCount()).unreadCount,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
  return q.data ?? 0;
}

/** Refetch everything notification-related whenever the app returns to the foreground. */
export function useRefreshNotificationsOnActive() {
  const client = useQueryClient();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void client.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => sub.remove();
  }, [client]);
}

function useRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ['notifications'] });
}

export function useMarkAllNotificationsRead() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: () => notificationsApi.markAllRead(), onSuccess: refresh });
}

export function useMarkNotificationRead() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: refresh,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: PREFS,
    queryFn: async () => (await notificationsApi.preferences()).preferences,
  });
}

export function useSetNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => notificationsApi.setPreferences(patch),
    onSuccess: ({ preferences }) => client.setQueryData(PREFS, preferences),
  });
}
