/**
 * Connects the saved appearance preference to the design system: resolves
 * light / dark / system to a concrete scheme, mirrors it to the OS
 * (`Appearance.setColorScheme`, so native alerts, keyboards and system bars
 * match), and provides the palette every component reads via `useThemeColors`.
 */
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { ThemeProvider, useResolvedScheme } from '@pandam/ui';

import { useUiStore } from '@/store/ui';

export function ThemeBridge({ children }: { children: ReactNode }) {
  const preference = useUiStore((s) => s.colorScheme);
  const hydrated = useUiStore((s) => s.schemeHydrated);
  const hydrate = useUiStore((s) => s.hydrateColorScheme);
  const device = useColorScheme();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Not implemented on web, where the palette alone carries the theme.
    Appearance.setColorScheme?.(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  // Hold the first paint until the saved choice is known, so a dark-mode user
  // never sees a flash of the light theme at launch.
  if (!hydrated) return null;

  const scheme = preference === 'system' ? (device === 'dark' ? 'dark' : 'light') : preference;
  return <ThemeProvider scheme={scheme}>{children}</ThemeProvider>;
}

/** Status-bar icons that contrast with the active theme. */
export function ThemedStatusBar() {
  const scheme = useResolvedScheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}
