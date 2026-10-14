/**
 * Thin wrapper around `@react-native-google-signin/google-signin` — isolated
 * into its own file, with a `.web.ts` sibling, so Metro's file-extension
 * platform resolution (not the package's own bundled web shim, which has a
 * known resolver bug in this pnpm monorepo setup — see git history) decides
 * what ships on web. This file is the iOS/Android implementation.
 *
 * The native module is loaded with a lazy `require()`, not a static
 * top-level `import`. `@react-native-google-signin/google-signin` calls
 * `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` as soon as its own
 * module code runs — which throws immediately in Expo Go (it only ships a
 * fixed set of native modules; this isn't one of them). A static import
 * would make that throw happen the instant ANYTHING imports this file
 * (i.e. on app start, for every user, even one who never touches the
 * Google button), crashing the whole app in Expo Go. Lazy-requiring it only
 * inside the functions below means that throw happens only if/when native
 * Google sign-in is actually attempted, and only in an environment that
 * can't support it — exactly mirroring how `isAppleSignInAvailable()`
 * handles the same class of problem for Apple sign-in.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

// `undefined` = not yet attempted; `null` = attempted and unavailable.
let loaded: GoogleSigninModule | null | undefined;

function requireGoogleSignin(): GoogleSigninModule {
  if (loaded === undefined) {
    // Expo Go never contains this native module. Even inside try/catch, Metro
    // reports a failed first `require` to the global handler, which shows a
    // red error screen in dev — so don't attempt it there at all.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      loaded = null;
    } else
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be lazy, see doc comment above
        loaded = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
      } catch {
        loaded = null;
      }
  }
  if (!loaded) {
    throw new Error(
      'Native Google sign-in needs a development or production build — it is not available in Expo Go.',
    );
  }
  return loaded;
}

/** True only where the native module is actually linked (a dev/production build). */
export function isGoogleNativeSignInAvailable(): boolean {
  try {
    requireGoogleSignin();
    return true;
  } catch {
    return false;
  }
}

let configured = false;

export function configureGoogleSignIn(params: { webClientId: string; iosClientId?: string }): void {
  if (configured) return;
  const { GoogleSignin } = requireGoogleSignin();
  GoogleSignin.configure({
    webClientId: params.webClientId,
    ...(Platform.OS === 'ios' && params.iosClientId ? { iosClientId: params.iosClientId } : {}),
  });
  configured = true;
}

export type NativeGoogleResult = { idToken: string; displayName?: string } | null;

export async function signInWithGoogleNativeSdk(): Promise<NativeGoogleResult> {
  const { GoogleSignin, statusCodes } = requireGoogleSignin();
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    // Forget the previously selected account so Google shows the account
    // chooser every time instead of silently reusing the last one.
    try {
      await GoogleSignin.signOut();
    } catch {
      // No cached session to clear — nothing to do.
    }
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return null;
    const { idToken, user } = response.data;
    if (!idToken) {
      throw new Error('Google did not return a usable sign-in token.');
    }
    return { idToken, displayName: user.name ?? undefined };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw err;
  }
}
