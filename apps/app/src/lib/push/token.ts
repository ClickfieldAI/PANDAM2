/**
 * This device's Expo push token, and the calls that register or drop it.
 *
 * Split out from `usePushRegistration` on purpose: sign-out needs to drop the
 * token, and the sign-out hook lives in `lib/auth/hooks`. If that reached into
 * the registration hook (which reads the session) the two modules would import
 * each other. Nothing in here knows about auth state.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { notificationsApi } from '@/lib/api/notifications';

/** The token this installation last registered with the API. */
let currentToken: string | null = null;

type NotificationsModule = typeof import('expo-notifications');

// `undefined` = not yet attempted; `null` = attempted and unavailable.
let loaded: NotificationsModule | null | undefined;

/**
 * True inside Expo Go specifically (as opposed to a real dev/production
 * build). On Android, `expo-notifications`'s own module-init code reports its
 * "removed from Expo Go" failure through React Native's global error handler
 * rather than a plain synchronous throw — it is NOT catchable by a JS
 * `try/catch` around `require()`, which is why wrapping the require alone
 * still crashed the app. The only reliable fix is to never call `require()`
 * on this module at all while running inside Expo Go.
 */
function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Expo Go on ANDROID cannot receive remote push at all (removed in SDK 53): it
 * needs a development build with Firebase (FCM) credentials. Expo Go on iOS can.
 */
export function pushBlockedByExpoGo(): boolean {
  return isExpoGo() && Platform.OS === 'android';
}

/**
 * Lazily `require`s `expo-notifications`, exactly like `googleNativeSignIn.ts`
 * does for the native Google SDK: a static top-level `import` runs this
 * module's own init code the instant ANYTHING imports this file, which — since
 * this file is pulled in unconditionally from the splash screen — crashed the
 * entire app for every Android Expo Go user before they ever saw a single
 * screen. Every function below already treats "unavailable" as a plain
 * `null`/`false`, never a crash.
 */
function requireNotifications(): NotificationsModule | null {
  if (loaded === undefined) {
    if (pushBlockedByExpoGo()) {
      loaded = null;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be lazy, see doc comment above
        loaded = require('expo-notifications') as NotificationsModule;
      } catch {
        loaded = null;
      }
    }
  }
  return loaded;
}

export function pushPlatform(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

/**
 * Ask Expo for this device's push token. Returns `null` for every reason a
 * device legitimately cannot have one — simulator, web, permission not
 * granted, no EAS credentials — rather than throwing, because none of those
 * are errors the user should ever see.
 */
export async function resolvePushToken(): Promise<string | null> {
  if (!Device.isDevice || Platform.OS === 'web') return null;
  const Notifications = requireNotifications();
  if (!Notifications) return null;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    // Expo needs the EAS project id to mint a token for a standalone build.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch (error) {
    // Not an error the user can fix in the UI, but the developer needs to see why
    // (for example missing Firebase/FCM credentials on Android).
    console.warn('[push] could not get a push token:', error);
    return null;
  }
}

/** Register a token with the API and remember it. Returns whether it stuck. */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    await notificationsApi.registerPushToken({ token, platform: pushPlatform() });
    currentToken = token;
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompt for notification permission and register. Call this from a screen,
 * in response to the user choosing to turn notifications on — never on first
 * launch, because iOS only ever asks once and a cold prompt gets denied.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return false;
  const Notifications = requireNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
  } catch {
    return false;
  }
  const token = await resolvePushToken();
  return token ? registerPushToken(token) : false;
}

/**
 * Show banners and play sound even while the app is open, and give Android a
 * high-importance channel (without one, Android shows nothing heads-up).
 * Safe to call repeatedly; does nothing where push is unavailable.
 */
export async function configureNotificationDisplay(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = requireNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Trades and messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch (error) {
    console.warn('[push] could not configure notification display:', error);
  }
}

/** True when permission has never been asked (so asking is allowed and useful). */
export async function pushPermissionUndetermined(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return false;
  const Notifications = requireNotifications();
  if (!Notifications) return false;
  try {
    return (await Notifications.getPermissionsAsync()).status === 'undetermined';
  } catch {
    return false;
  }
}

/** Whether this device currently has permission to show notifications. */
export async function hasPushPermission(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return false;
  const Notifications = requireNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Whether this device could receive push at all. Used to decide whether to
 * offer the opt-in — there is no point asking on a simulator or on web.
 */
export function pushSupported(): boolean {
  return Device.isDevice && Platform.OS !== 'web';
}

/** Stop pushing to this device. Called on sign-out; never throws. */
export async function unregisterPushToken(): Promise<void> {
  if (!currentToken) return;
  try {
    await notificationsApi.unregisterPushToken({ token: currentToken, platform: pushPlatform() });
  } catch {
    // Signing out must succeed whether or not the server heard about it.
  }
  currentToken = null;
}
