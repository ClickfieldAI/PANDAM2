import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { darkColors, lightColors, type ThemeColors } from './tokens';

export type ResolvedScheme = 'light' | 'dark';

interface ThemeValue {
  scheme: ResolvedScheme;
  colors: ThemeColors;
}

const LIGHT: ThemeValue = { scheme: 'light', colors: lightColors };
const DARK: ThemeValue = { scheme: 'dark', colors: darkColors };

const ThemeContext = createContext<ThemeValue>(LIGHT);

/**
 * Supplies the active palette. The app resolves the user's preference
 * (light / dark / system) to a concrete scheme and passes it in here.
 */
export function ThemeProvider({
  scheme,
  children,
}: {
  scheme: ResolvedScheme;
  children: ReactNode;
}) {
  const value = useMemo(() => (scheme === 'dark' ? DARK : LIGHT), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The active semantic palette. Re-renders the caller when the theme changes. */
export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export function useResolvedScheme(): ResolvedScheme {
  return useContext(ThemeContext).scheme;
}
