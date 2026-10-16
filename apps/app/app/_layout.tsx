import '../src/styles/global.css';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
  InterTight_900Black,
  useFonts,
} from '@expo-google-fonts/inter-tight';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { Splash } from '@/components/Splash';
import { initMonitoring } from '@/lib/monitoring';
import { ThemedStatusBar } from '@/lib/theme/ThemeBridge';
import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout() {
  useEffect(() => {
    initMonitoring();
  }, []);

  // The whole type system (`typography` in @pandam/ui/tokens) pins exact
  // Inter / Inter Tight weight files — a custom font family on RN only
  // applies per-weight, so every weight the design uses has to be loaded
  // before anything renders, not swapped in after a flash of the fallback.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    InterTight_800ExtraBold,
    InterTight_900Black,
  });

  return (
    <AppProviders>
      <ThemedStatusBar />
      {fontsLoaded ? <Stack screenOptions={{ headerShown: false }} /> : <Splash />}
    </AppProviders>
  );
}
