import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '../haptics';
import { useThemeColors } from '../theme';
import { layout, palette, radii, shadows, spacing, timings } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Press } from './Press';
import { Text } from './Text';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  kind?: ToastKind;
  /** A single inline action, e.g. "Undo" or "View". */
  action?: { label: string; onPress: () => void };
  /** Milliseconds on screen. Errors default to longer than confirmations. */
  duration?: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  /** Convenience wrappers so call sites read as English. */
  success: (message: string, options?: Omit<ToastOptions, 'message' | 'kind'>) => void;
  error: (message: string, options?: Omit<ToastOptions, 'message' | 'kind'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Non-blocking confirmation.
 *
 * The product was using the OS alert for "that worked" messages, which stops
 * everything and demands a tap to dismiss something the user did not ask
 * about. A toast reports the outcome and gets out of the way. The OS alert is
 * still the right tool for a *question* — "delete this?" — and is deliberately
 * left in place for those.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // A no-op rather than a throw: a missing provider should never be able to
    // break a screen whose real job is something else.
    return {
      show: () => undefined,
      success: () => undefined,
      error: () => undefined,
    };
  }
  return ctx;
}

const makeKIND = (
  colors: ThemeColors,
): Record<ToastKind, { bg: string; border: string; glyph: string; fg: string }> => ({
  // Dark surfaces, because a toast sits over content and needs to read as a
  // layer above the page rather than another card in it.
  success: {
    bg: colors.surfaceInverse,
    border: palette.charcoal,
    glyph: '✓',
    fg: palette.orange200,
  },
  error: { bg: '#3A1B16', border: '#5E2A22', glyph: '!', fg: palette.orange200 },
  info: {
    bg: colors.surfaceInverse,
    border: palette.charcoal,
    glyph: 'i',
    fg: palette.concrete,
  },
});

interface Live extends ToastOptions {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const colors = useThemeColors();

  const [toast, setToast] = useState<Live | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 0 : timings.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [progress, reduceMotion]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      counter.current += 1;
      // Tactile twin of the visual outcome. `show` is only called once a
      // request has actually settled, so this never precedes the result.
      if (options.kind === 'success') haptic.success();
      else if (options.kind === 'error') haptic.error();
      setToast({ ...options, id: counter.current });

      // Screen readers do not see the toast appear, so announce it.
      AccessibilityInfo.announceForAccessibility?.(options.message);

      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion ? 0 : timings.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // An error gets longer on screen than a confirmation: it usually carries
      // something the reader has to act on rather than just acknowledge.
      const ms = options.duration ?? (options.kind === 'error' ? 6000 : 3600);
      timer.current = setTimeout(dismiss, ms);
    },
    [dismiss, progress, reduceMotion],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, options) => show({ ...options, message, kind: 'success' }),
      error: (message, options) => show({ ...options, message, kind: 'error' }),
    }),
    [show],
  );

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const spec = toast ? makeKIND(colors)[toast.kind ?? 'info'] : makeKIND(colors).info;

  return (
    <ToastContext.Provider value={value}>
      {children}

      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            // Clears the docked tab bar plus the home indicator, so a toast
            // never lands on top of the navigation.
            bottom: insets.bottom + 72,
            paddingHorizontal: layout.gutter,
            alignItems: 'center',
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}
        >
          <View
            accessibilityRole={Platform.OS === 'web' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                width: '100%',
                maxWidth: 460,
                backgroundColor: spec.bg,
                borderWidth: 1,
                borderColor: spec.border,
                borderRadius: radii.lg,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
              },
              shadows.lg,
            ]}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: radii.pill,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="caption" style={{ color: spec.fg, fontWeight: '600' }}>
                {spec.glyph}
              </Text>
            </View>

            <Text variant="bodySm" style={{ flex: 1, color: colors.textInverse }}>
              {toast.message}
            </Text>

            {toast.action ? (
              <Press
                scale="sm"
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.sm,
                }}
                states={{ hover: { backgroundColor: 'rgba(255,255,255,0.12)' } }}
              >
                <Text variant="label" style={{ color: spec.fg }}>
                  {toast.action.label}
                </Text>
              </Press>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}
