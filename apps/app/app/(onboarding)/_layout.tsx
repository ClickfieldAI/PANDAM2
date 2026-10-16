import { Redirect, Stack } from 'expo-router';

import { useThemeColors } from '@pandam/ui';

import { Splash, useHoldSplash } from '@/components/Splash';
import { useSession } from '@/lib/auth/hooks';

/**
 * First-time onboarding (identity verification). Signed-in users only; the
 * decision to SEND someone here is made by the `(app)` guard, which redirects
 * any signed-in user whose identity is not yet verified.
 */
export default function OnboardingLayout() {
  const colors = useThemeColors();

  const { isResolving, isAuthenticated } = useSession();
  const showSplash = useHoldSplash(isResolving);
  if (showSplash) return <Splash />;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
