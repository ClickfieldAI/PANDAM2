/**
 * Composes every app-wide provider in one place so the router layout stays
 * declarative. Order: gesture handler → safe-area → query cache → analytics →
 * auth bootstrap (loads the native session token before anything renders) →
 * toasts.
 *
 * Toasts sit INSIDE the safe-area provider (they read the bottom inset to
 * clear the home indicator) but outside the router, so a toast survives a
 * navigation — "your offer was sent" should still be readable on the screen
 * you land on afterwards.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenBackdropProvider, ToastProvider } from '@pandam/ui';

import { AnalyticsProvider } from '@/lib/analytics';
import { AuthBootstrap } from '@/lib/auth/AuthBootstrap';
import { createQueryClient } from '@/lib/query';
import { ThemeBridge } from '@/lib/theme/ThemeBridge';

/**
 * Swiss/neo-brutalist direction: a FLAT off-white page, no ambient glow or
 * decorative gradient circles behind standard screens — that soft-peach
 * backdrop was the single biggest visual mismatch against the brief. Screens
 * that still want their own full-bleed art (Splash, the login marketing
 * panel) mount it explicitly via `backdrop`, not through this default.
 */
const APP_BACKDROP = null;

export function AppProviders({ children }: { children: ReactNode }) {
  // Lazy state initialiser → one stable QueryClient for the component's life.
  const [queryClient] = useState(createQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeBridge>
          <QueryClientProvider client={queryClient}>
            <AnalyticsProvider>
              <ToastProvider>
                <ScreenBackdropProvider value={APP_BACKDROP}>
                  <AuthBootstrap>{children}</AuthBootstrap>
                </ScreenBackdropProvider>
              </ToastProvider>
            </AnalyticsProvider>
          </QueryClientProvider>
        </ThemeBridge>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
