import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';

import { type NotificationType, type NotificationView } from '@pandam/types';
import {
  Button,
  EmptyState,
  GroupedList,
  IconFrame,
  ListRow,
  Notice,
  Screen,
  SkeletonList,
  Text,
  layout,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { timeAgo } from '@/lib/format';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useNotificationPreferences,
  useSetNotificationPreferences,
} from '@/lib/hooks/useNotifications';
import {
  hasPushPermission,
  pushBlockedByExpoGo,
  pushSupported,
  requestPushPermission,
} from '@/lib/push/token';

type Tone = 'accent' | 'need' | 'match' | 'neutral';

/**
 * What each notification type says and looks like.
 *
 * The tone is the semantic one — an offer is terracotta because it is about
 * something you have, a review is neutral, a match would be sage. That
 * keeps the colour language consistent all the way down to a list row.
 */
const COPY: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; label: string; tone: Tone }
> = {
  offer_received: { icon: 'paper-plane-outline', label: 'New barter offer', tone: 'accent' },
  offer_accepted: { icon: 'checkmark-circle-outline', label: 'Offer accepted', tone: 'accent' },
  offer_rejected: { icon: 'close-circle-outline', label: 'Offer declined', tone: 'neutral' },
  offer_cancelled: { icon: 'close-circle-outline', label: 'Offer withdrawn', tone: 'neutral' },
  offer_expired: { icon: 'time-outline', label: 'Offer expired', tone: 'neutral' },
  offer_countered: { icon: 'swap-horizontal-outline', label: 'Counter offer', tone: 'accent' },
  message_received: { icon: 'chatbubble-outline', label: 'New message', tone: 'accent' },
  transaction_updated: { icon: 'repeat-outline', label: 'Trade updated', tone: 'need' },
  review_reminder: { icon: 'star-outline', label: 'Leave a review', tone: 'need' },
  review_received: { icon: 'star-outline', label: 'New review', tone: 'match' },
  moderation_notice: {
    icon: 'shield-outline',
    label: 'A moderator removed one of your posts',
    tone: 'neutral',
  },
  report_update: {
    icon: 'flag-outline',
    label: 'A report you filed was reviewed',
    tone: 'neutral',
  },
  listing_match: {
    icon: 'sparkles-outline',
    label: 'New listing for something you need',
    tone: 'match',
  },
  listing_saved: { icon: 'heart-outline', label: 'Someone saved your listing', tone: 'accent' },
  need_match: {
    icon: 'search-outline',
    label: 'Someone needs something you have',
    tone: 'need',
  },
};

/** Where a notification takes you, or null when it has no specific target. */
function target(n: NotificationView): string | null {
  if (n.data.conversationId) return `/(app)/chat/${n.data.conversationId}`;
  if (n.data.offerId) return `/(app)/offer/${n.data.offerId}`;
  if (n.data.transactionId) return `/(app)/transaction/${n.data.transactionId}`;
  if (n.data.paymentId) return `/(app)/payment/${n.data.paymentId}`;
  if (n.data.needId) return `/(app)/need/${n.data.needId}`;
  if (n.data.listingId) return `/(app)/listing/${n.data.listingId}`;
  return null;
}

/**
 * The push opt-in.
 *
 * Shown only once there is something in the feed, and only on a device that
 * could actually receive a push. iOS asks for notification permission exactly
 * once per install, so the prompt is spent here — where the reader has just
 * seen what they would be notified about — rather than on a cold first launch
 * where it gets denied out of reflex.
 */
function PushOptIn() {
  const colors = useThemeColors();

  // `pushSupported()` reads only the platform and device kind, so it is
  // resolved in the initial state rather than in the effect — on a simulator
  // or on web this component then never renders or schedules anything.
  const [state, setState] = useState<'checking' | 'off' | 'on' | 'denied' | 'unsupported'>(() =>
    pushSupported() ? 'checking' : 'unsupported',
  );

  useEffect(() => {
    if (state !== 'checking') return;
    let cancelled = false;
    void hasPushPermission().then((granted) => {
      if (!cancelled) setState(granted ? 'on' : 'off');
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  // Expo Go on Android cannot do push at all — say so instead of offering a button that cannot work.
  if (pushBlockedByExpoGo()) {
    return (
      <Notice kind="neutral" title="Phone pop-ups need a full app build">
        Android's Expo Go can't receive push notifications. Offers and messages still appear in this
        list; pop-ups on Android need a development build of PANDAM.
      </Notice>
    );
  }
  if (state === 'on' || state === 'checking' || state === 'unsupported') return null;

  const denied = state === 'denied';

  return (
    <Notice
      kind={denied ? 'neutral' : 'info'}
      title={denied ? 'Notifications are blocked' : 'Get told about new offers'}
      icon={
        <Ionicons
          name={denied ? 'notifications-off-outline' : 'notifications-outline'}
          size={16}
          color={denied ? colors.textMuted : colors.info}
        />
      }
      action={
        denied ? undefined : (
          <Button
            label="Turn on"
            variant="secondary"
            size="sm"
            onPress={() =>
              void requestPushPermission().then((granted) => setState(granted ? 'on' : 'denied'))
            }
          />
        )
      }
    >
      {denied
        ? 'Turn them back on in your device settings for PANDAM.'
        : 'A trade falls through when nobody replies. We only notify you about your own trades.'}
    </Notice>
  );
}

/** Two switches. Push only affects pop-ups on your phone; the list here is always kept. */
function AlertSettings() {
  const prefs = useNotificationPreferences();
  const save = useSetNotificationPreferences();
  if (!prefs.data) return null;
  const rows = [
    {
      key: 'pushEnabled' as const,
      title: 'Push notifications',
      hint: 'Pop-ups on your phone. Turning this off never removes anything from this list.',
    },
    {
      key: 'listingAlerts' as const,
      title: 'Listings that match my requests',
      hint: 'Tell me when someone lists something in a category I asked for.',
    },
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r) => (
        <View
          key={r.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text variant="bodyStrong">{r.title}</Text>
            <Text variant="caption" tone="muted">
              {r.hint}
            </Text>
          </View>
          <Switch
            value={prefs.data[r.key]}
            disabled={save.isPending}
            accessibilityLabel={r.title}
            onValueChange={(v) => save.mutate({ [r.key]: v })}
          />
        </View>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const notifications = useNotificationFeed();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const items = notifications.data?.pages.flatMap((p) => p.items) ?? [];
  // The server's count, not a count of whatever pages happen to be loaded.
  const unread = notifications.data?.pages[0]?.unreadCount ?? 0;

  return (
    <Screen padded={false}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
        }}
      >
        <AppHeader
          title="Notifications"
          subtitle={unread > 0 ? `${unread} unread` : undefined}
          back
          right={
            unread > 0 ? (
              <Button
                label="Mark all read"
                variant="quiet"
                size="sm"
                loading={markAllRead.isPending}
                onPress={() => markAllRead.mutate()}
              />
            ) : null
          }
        />
      </View>

      <GroupedList
        data={items}
        keyExtractor={(n) => n.id}
        showsVerticalScrollIndicator={false}
        refreshing={notifications.isRefetching && !notifications.isFetchingNextPage}
        onRefresh={() => void notifications.refetch()}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (notifications.hasNextPage && !notifications.isFetchingNextPage) {
            void notifications.fetchNextPage();
          }
        }}
        separatorInset={spacing.lg + 38 + spacing.md}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.md,
          paddingBottom: layout.tabBarInset,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={{ marginBottom: spacing.lg, gap: spacing.md }}>
              <PushOptIn />
              <AlertSettings />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const copy = COPY[item.type];
          return (
            <ListRow
              leading={
                <IconFrame tone={item.read ? 'neutral' : copy.tone}>
                  <Ionicons
                    name={copy.icon}
                    size={17}
                    color={
                      item.read
                        ? colors.textMuted
                        : copy.tone === 'accent'
                          ? colors.accent
                          : copy.tone === 'need'
                            ? colors.need
                            : copy.tone === 'match'
                              ? colors.match
                              : colors.textSecondary
                    }
                  />
                </IconFrame>
              }
              title={item.title ?? copy.label}
              subtitle={item.body ?? undefined}
              meta={timeAgo(item.createdAt)}
              emphasis={!item.read}
              chevron={
                target(item) ? (
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                ) : undefined
              }
              onPress={() => {
                if (!item.read) markRead.mutate(item.id);
                const to = target(item);
                if (to) router.push(to as never);
              }}
            />
          );
        }}
        ListEmptyComponent={
          notifications.isPending ? (
            <SkeletonList count={4} />
          ) : notifications.isError ? (
            <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
          ) : (
            <View style={{ gap: spacing.lg }}>
              <EmptyState
                icon={
                  <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
                }
                title="You are all caught up"
                body="Offers, messages and trade updates land here."
              />
              <PushOptIn />
            </View>
          )
        }
        ListFooterComponent={
          notifications.isFetchingNextPage ? (
            <SkeletonList count={1} />
          ) : items.length > 0 ? (
            <Text
              variant="caption"
              tone="faint"
              center
              style={{ paddingTop: spacing.xl, paddingBottom: spacing.lg }}
            >
              Only your own trades are ever notified.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}
