/**
 * Makes a tapped push notification land on the right screen.
 *
 * The payload the Worker sends (`services/notify.ts`) carries the related ids,
 * so the routing table here mirrors the one the in-app notification list uses.
 * Anything unrecognised falls back to the notifications screen rather than
 * doing nothing — a tap that appears to be ignored reads as a broken app.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/lib/auth/hooks';
import { qk } from '@/lib/query/keys';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Lazily `require`s `expo-notifications` — see the identical pattern (and
 * full explanation) in `lib/push/token.ts`. On Android, this module's own
 * init code reports its "removed from Expo Go" failure through React
 * Native's global error handler, not a catchable throw — a `try/catch`
 * around `require()` alone does NOT stop it, so Expo Go is detected and the
 * require is skipped entirely rather than attempted-and-caught. This hook
 * runs from the app's root authenticated layout, so it fires for every
 * signed-in user, every time — which crashed the whole app on Android Expo
 * Go the instant anyone signed in, even after the splash-screen import (and
 * even a try/caught require) was fixed.
 */
function requireNotifications(): NotificationsModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be lazy, see doc comment above
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

type PushData = Record<string, unknown>;

/** Where a notification payload should take the user. */
function routeFor(data: PushData): string {
  const str = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : null);
  const offerId = str('offerId');
  const transactionId = str('transactionId');
  const conversationId = str('conversationId');
  const paymentId = str('paymentId');
  const needId = str('needId');

  if (conversationId) return `/(app)/chat/${conversationId}`;
  if (offerId) return `/(app)/offer/${offerId}`;
  if (transactionId) return `/(app)/transaction/${transactionId}`;
  if (paymentId) return `/(app)/payment/${paymentId}`;
  if (needId) return `/(app)/need/${needId}`;
  return '/(app)/notifications';
}

export function useNotificationRouting(): void {
  const router = useRouter();
  const client = useQueryClient();
  const { isAuthenticated } = useSession();

  useEffect(() => {
    if (!isAuthenticated) return;
    const Notifications = requireNotifications();
    if (!Notifications) return;

    // A push means something changed server-side, so refresh the feed whether
    // the app was opened by the tap or was already in the foreground.
    const received = Notifications.addNotificationReceivedListener(() => {
      void client.invalidateQueries({ queryKey: ['notifications'] });
      void client.invalidateQueries({ queryKey: qk.offers.all });
      void client.invalidateQueries({ queryKey: qk.conversations.all });
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as PushData;
      router.push(routeFor(data) as never);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [isAuthenticated, client, router]);
}
