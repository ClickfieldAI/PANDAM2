/**
 * A short confirmation moment ("Trade accepted") for things the SERVER has
 * confirmed. Call `celebrate()` from a mutation's `onSuccess` — never before
 * the response, never from an optimistic update. It renders above the
 * navigator, so it survives a `router.replace` that follows it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

import { Text, spacing, useMotionOK, useThemeColors } from '@pandam/ui';

import { SuccessAnimation } from './SuccessAnimation';

type Celebrate = (message: string) => void;
const Ctx = createContext<Celebrate>(() => undefined);

/** Hold time. The lottie itself runs ~1.6 s; reduced motion gets a shorter, still card. */
const HOLD_MS = 1900;
const HOLD_REDUCED_MS = 1400;

export const useCelebrate = (): Celebrate => useContext(Ctx);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const colors = useThemeColors();
  const motionOK = useMotionOK();
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMessage(null);
  }, []);

  const celebrate = useCallback<Celebrate>(
    (text) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      // Screen readers get the words, not the picture.
      void AccessibilityInfo.announceForAccessibility?.(text);
      timer.current = setTimeout(dismiss, motionOK ? HOLD_MS : HOLD_REDUCED_MS);
    },
    [dismiss, motionOK],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => celebrate, [celebrate]);

  return (
    <Ctx.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {message ? (
          <Pressable
            onPress={dismiss}
            accessibilityRole="alert"
            accessibilityLabel={message}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          >
            <View
              style={{
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: spacing['2xl'],
                paddingHorizontal: spacing['3xl'],
                borderRadius: 24,
                backgroundColor: colors.surface,
                maxWidth: 320,
              }}
            >
              <SuccessAnimation size={96} />
              <Text variant="bodyStrong" center>
                {message}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </Ctx.Provider>
  );
}
