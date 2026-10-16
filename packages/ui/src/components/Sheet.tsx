import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { nearestOf2, project, rubberband } from '../motion/physics';
import { useMotionOK } from '../motion/useMotionOK';
import { useThemeColors } from '../theme';
import { radii, shadows, springs, spacing } from '../tokens';

import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Device bottom inset (safe area) — passed in so this package stays dependency-free. */
  bottomInset?: number;
}

/** Below this many px/s of downward velocity a release is a "drop", not a flick. */
const FLICK_VELOCITY = 400;
/** Fallback height before the first layout measures the real one. */
const FALLBACK_HEIGHT = 480;

type PointerLike = { nativeEvent: { pageY?: number } };
type Sample = { y: number; t: number };

/**
 * Bottom sheet, built as a physical object per the `apple-design` skill:
 *
 *  - Opens and closes along the SAME path (§7) — closing is a real reverse
 *    animation, not the platform's default modal fade. The Modal itself
 *    stays mounted for the duration of that exit spring.
 *  - The grab handle + header are directly draggable (§2, §10): 1:1 with the
 *    finger, tracked in real measured pixels rather than a guessed height.
 *  - On release, velocity is handed off to the settle spring (§5) and used
 *    to PROJECT a resting point (§6) — a fast flick dismisses even from
 *    near-open, a slow drag mostly decides by position.
 *  - Dragging past fully-open rubber-bands (§9) instead of stopping dead.
 *  - Every spring reads the sheet's live on-screen position, so grabbing it
 *    mid-animation (opening, or already being dismissed) redirects cleanly
 *    (§3) — nothing here is a fixed-duration transition.
 *  - Reduced motion drops the slide for a short cross-fade (§14); the
 *    gesture itself still tracks 1:1 (it's user-initiated, not autoplayed),
 *    only the springs/velocity/bounce are removed.
 *  - `scheduleFinishClose` is a JS-timer backstop alongside every closing
 *    spring's own completion callback: on this Reanimated/web combination an
 *    under-damped spring carrying a large handed-off velocity was observed
 *    to visibly reach its resting position but never invoke `finished`,
 *    which would otherwise leave the Modal mounted (invisible, but still
 *    intercepting input) forever. `finishClose` is idempotent, so whichever
 *    of the two fires first wins and the other is a no-op.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  bottomInset = 0,
}: SheetProps) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const [shown, setShown] = useState(visible);
  const heightRef = useRef(FALLBACK_HEIGHT);
  const y = useSharedValue(FALLBACK_HEIGHT);
  const opacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const history = useRef<Sample[]>([]);
  const closed = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0 || Math.abs(h - heightRef.current) < 1) return;
    heightRef.current = h;
    // Only the resting bound moves; a sheet already open or mid-drag stays put.
    if (!visible && !dragging.value) y.set(h);
  };

  const finishClose = () => {
    if (closed.current) return; // idempotent: the animation callback and the
    closed.current = true; // safety timer below can both fire once.
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setShown(false);
    onClose();
  };

  /**
   * `withSpring`'s completion callback is the correct, idiomatic way to chain
   * "unmount after the exit animation" — but on this web/Reanimated stack it
   * has been observed to never fire for an under-damped spring carrying a
   * large handed-off velocity (the sheet visibly reaches its resting
   * position; the callback simply never runs). Rather than trust a single
   * signal for something the user is waiting on, a plain JS timer backs it
   * up: whichever fires first wins, `finishClose` is idempotent either way.
   * `settleMs` only needs to safely exceed the spring's real settle time.
   */
  const scheduleFinishClose = (settleMs: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(finishClose, settleMs);
  };

  useEffect(() => {
    if (visible) {
      closed.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
      setShown(true);
      dragging.set(false);
      y.set(heightRef.current);
      if (motionOK) {
        opacity.set(1);
        y.set(withSpring(0, springs.sheet));
      } else {
        y.set(withTiming(0, { duration: 1 }));
        opacity.set(withTiming(1, { duration: 160 }));
      }
    } else if (shown) {
      if (motionOK) {
        y.set(
          withSpring(heightRef.current, springs.sheet, (finished) => {
            if (finished) runOnJS(finishClose)();
          }),
        );
        scheduleFinishClose(700);
      } else {
        opacity.set(
          withTiming(0, { duration: 120 }, (finished) => {
            if (finished) runOnJS(finishClose)();
          }),
        );
        scheduleFinishClose(200);
      }
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible, motionOK]);

  /* ------------------------------------------------------------ drag -- */
  const pushSample = (pageY: number) => {
    const now = Date.now();
    history.current.push({ y: pageY, t: now });
    if (history.current.length > 5) history.current.shift();
  };
  const releaseVelocity = (): number => {
    const h = history.current;
    if (h.length < 2) return 0;
    const first = h[0]!;
    const last = h[h.length - 1]!;
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.y - first.y) / dt : 0;
  };

  const startDrag = (pageY: number) => {
    dragging.set(true);
    dragStartY.set(pageY);
    history.current = [{ y: pageY, t: Date.now() }];
  };
  const moveDrag = (pageY: number) => {
    if (!dragging.value) return;
    pushSample(pageY);
    const raw = pageY - dragStartY.value; // 0 = still fully open
    // Only the "further open than open" direction is a boundary — resist it;
    // dragging toward closed tracks 1:1, exactly like the finger.
    y.set(raw < 0 ? -rubberband(-raw, heightRef.current) : raw);
  };
  const endDrag = () => {
    if (!dragging.value) return;
    dragging.set(false);
    const v = releaseVelocity();
    history.current = [];

    if (!motionOK) {
      const openHere = y.value < heightRef.current / 2;
      y.set(
        withTiming(openHere ? 0 : heightRef.current, { duration: 150 }, (finished) => {
          if (!openHere && finished) runOnJS(finishClose)();
        }),
      );
      if (!openHere) scheduleFinishClose(200);
      return;
    }

    // Momentum projection (§6): where would this gesture land on its own?
    const projected = y.value + project(v);
    const target = nearestOf2(projected, 0, heightRef.current);
    // A firm downward flick always dismisses, even if released near-open —
    // matches a real drawer, which a shove closes regardless of hand position.
    const goingClosed = target === heightRef.current || v > FLICK_VELOCITY;
    const to = goingClosed ? heightRef.current : 0;
    y.set(
      withSpring(to, { ...springs.sheet, velocity: v }, (finished) => {
        if (goingClosed && finished) runOnJS(finishClose)();
      }),
    );
    // A flick can hand off a large velocity into an under-damped spring —
    // give it more headroom than the plain programmatic close (see the
    // `scheduleFinishClose` doc comment for why this backstop exists at all).
    if (goingClosed) scheduleFinishClose(900);
  };

  const onTouchStart = (e: GestureResponderEvent) => startDrag(e.nativeEvent.pageY);
  const onTouchMove = (e: GestureResponderEvent) => moveDrag(e.nativeEvent.pageY);
  const onTouchEnd = () => endDrag();
  // Pointer Events cover web/mouse drag; touch events cover native. Neither
  // claims the responder outside the handle/header, so children (a Field, a
  // Button) inside the sheet body keep receiving their own taps untouched.
  const pointerHandlers = {
    onPointerDown: (e: PointerLike) => startDrag(e.nativeEvent.pageY ?? 0),
    onPointerMove: (e: PointerLike) => moveDrag(e.nativeEvent.pageY ?? 0),
    onPointerUp: () => endDrag(),
    onPointerLeave: () => dragging.value && endDrag(),
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
    opacity: opacity.get(),
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: motionOK ? Math.max(0, 1 - y.get() / (heightRef.current || 1)) : opacity.get(),
  }));

  if (!shown) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[{ position: 'absolute', inset: 0 }, scrimStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ flex: 1, backgroundColor: colors.scrim }}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={onSheetLayout}
          style={[
            {
              width: '100%',
              maxWidth: 520,
              alignSelf: 'center',
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.sm,
              paddingBottom: Math.max(bottomInset, spacing.lg) + spacing.sm,
              ...shadows.lg,
            },
            sheetStyle,
          ]}
        >
          {/* Draggable region: handle + header only, so scroll/taps in the
              body below are never intercepted. */}
          <View
            {...pointerHandlers}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                marginBottom: spacing.md,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: spacing.md,
                marginBottom: spacing.lg,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h2">{title}</Text>
                {subtitle ? (
                  <Text variant="bodySm" tone="secondary">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 18, lineHeight: 20, color: colors.textSecondary }}>✕</Text>
              </Pressable>
            </View>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
