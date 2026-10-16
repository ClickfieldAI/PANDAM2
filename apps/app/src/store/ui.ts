/**
 * Global client/UI state (Zustand). NOT for server data — that belongs to
 * TanStack Query. Keep this store small: things like theme, onboarding flags,
 * transient banners.
 *
 * `colorScheme` is the user's appearance PREFERENCE (light / dark / follow the
 * device). It is saved to AsyncStorage and restored at launch by
 * `hydrateColorScheme()`; the concrete palette is resolved in `ThemeBridge`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ColorScheme = 'light' | 'dark' | 'system';

const SCHEME_KEY = 'pandam.theme.v1';

interface UiState {
  colorScheme: ColorScheme;
  /** True once the saved preference has been read (or failed to read). */
  schemeHydrated: boolean;
  hasCompletedOnboarding: boolean;
  setColorScheme: (scheme: ColorScheme) => void;
  hydrateColorScheme: () => Promise<void>;
  completeOnboarding: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  colorScheme: 'system',
  schemeHydrated: false,
  hasCompletedOnboarding: false,
  setColorScheme: (colorScheme) => {
    set({ colorScheme });
    AsyncStorage.setItem(SCHEME_KEY, colorScheme).catch(() => undefined);
  },
  hydrateColorScheme: async () => {
    try {
      const saved = await AsyncStorage.getItem(SCHEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        set({ colorScheme: saved });
      }
    } catch {
      // fall back to following the device
    }
    set({ schemeHydrated: true });
  },
  completeOnboarding: () => set({ hasCompletedOnboarding: true }),
}));
