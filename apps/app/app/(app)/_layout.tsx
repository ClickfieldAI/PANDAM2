import { Redirect, Stack } from 'expo-router';

import { useThemeColors } from '@pandam/ui';

import { Splash, useHoldSplash } from '@/components/Splash';
import { useSession } from '@/lib/auth/hooks';
import { useNotificationRouting } from '@/lib/hooks/useNotificationRouting';
import { usePushRegistration } from '@/lib/hooks/usePushRegistration';
import { TourProvider } from '@/lib/tour/TourProvider';

/** Authenticated area. Guards every screen inside `(app)`. */
export default function AppLayout() {
  const colors = useThemeColors();

  const { isResolving, isAuthenticated, user } = useSession();
  // Both are no-ops until somebody is signed in, so they can sit above the
  // guard and keep their hook order stable across the redirect.
  usePushRegistration();
  useNotificationRouting();

  const showSplash = useHoldSplash(isResolving);
  if (showSplash) return <Splash />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // First-time onboarding: a signed-in account that has not finished the
  // one-time identity verification is sent there (and resumes where it
  // stopped). Verified accounts never see it again.
  if (user?.identityVerification?.status !== 'verified') {
    return <Redirect href="/(onboarding)/verify" />;
  }

  return (
    <TourProvider key={user.id} userId={user.id}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-listing" options={{ presentation: 'modal' }} />
        <Stack.Screen name="new-need" options={{ presentation: 'modal' }} />
        <Stack.Screen name="report" options={{ presentation: 'modal' }} />
      </Stack>
    </TourProvider>
  );
}
