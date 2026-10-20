/**
 * Keeps this device's push token registered to whoever is signed in.
 *
 * Permission is requested once, right after sign-in, only while it has
 * never been answered; after that it only re-registers when already granted. A device that
 * cannot receive push — simulator, web, permission denied — ends here
 * silently, because the in-app notification feed is the real channel.
 */
import { useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth/hooks';
import {
  configureNotificationDisplay,
  pushPermissionUndetermined,
  registerPushToken,
  requestPushPermission,
  resolvePushToken,
} from '@/lib/push/token';

export function usePushRegistration(): void {
  const { user } = useSession();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      registeredFor.current = null;
      return;
    }
    // The same phone can be handed to a second account, so re-register when
    // the signed-in user changes — the server moves the token across.
    if (registeredFor.current === user.id) return;

    let cancelled = false;
    void (async () => {
      await configureNotificationDisplay();
      // Like WhatsApp: ask once, right after sign-in, if the question has never been
      // answered. (iOS only ever asks once, so it is asked while the user is looking at the app.)
      if (await pushPermissionUndetermined()) {
        const ok = await requestPushPermission(); // registers the token itself on success
        if (ok) registeredFor.current = user.id;
        return;
      }
      const token = await resolvePushToken();
      if (!token || cancelled) return;
      // Left unset on failure, so the next mount tries again.
      if (await registerPushToken(token)) registeredFor.current = user.id;
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
