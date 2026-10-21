import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionOK } from '@pandam/ui';

import { brandAssets } from './assets';
import { BRAND } from './brand';
import { frameAt, introLayout, progressOf } from './geometry';
import { PaperBackground } from './PaperBackground';

/** Screen 1 (the P alone) stays this long before it moves on by itself. */
const FIRST_HOLD_MS = 2000;
/** The P travels into the full logo over this long. */
const TRANSITION_MS = 1300;
/** Screen 2 (the full logo) stays this long, then the intro hands over to the app. */
const SECOND_HOLD_MS = 2000;

const FILL = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

/**
 * Two screens that play by themselves, on ONE continuous cream paper:
 *   1. the P symbol alone, centred;
 *   2. the complete official logo, centred, with the orange/black halftone shapes in the corners.
 *
 * Timeline: the P alone for 2s, the transition, the full logo for 2s, then `onDone` (the gate
 * fades the intro out into the app). A tap skips ahead.
 *
 * The P is a real shared element. One progress value (0 to 1) drives it; `frameAt` in
 * ./geometry turns it into every layer's position and opacity. The P from screen 1 travels and
 * resizes into the exact spot of the P inside the full logo; the wordmark and tagline are revealed
 * outward from it; the corner shapes slide in. Only at the very end does the intact logo fade in
 * as the travelling P fades out. They are aligned, so there is never a second P on screen.
 *
 * All positions come from the measured stage size and safe-area insets, never from fixed screen
 * sizes. Under "reduce motion" nothing travels: the two screens swap.
 */
export function BrandIntro({ onDone }: { onDone: () => void }) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const motionOK = useMotionOK();

  // The stage's real size (falls back to the window until the first layout pass).
  const [stage, setStage] = useState({ width: win.width, height: win.height });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setStage({ width, height });
  };
  const W = stage.width;
  const H = stage.height;
  const L = introLayout(W, H, insets.top, insets.bottom);

  // The scroll-offset-like value `frameAt` reads: 0 = screen 1, W = screen 2.
  const x = useSharedValue(0);
  const stage2 = useRef(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  const startTransition = useCallback(() => {
    if (stage2.current) return;
    stage2.current = true;
    x.set(withTiming(W, { duration: TRANSITION_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [W, x]);

  // The whole sequence: hold, transition, hold, hand over. A tap skips to the next step.
  useEffect(() => {
    const t1 = setTimeout(startTransition, FIRST_HOLD_MS);
    const t2 = setTimeout(finish, FIRST_HOLD_MS + TRANSITION_MS + SECOND_HOLD_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [startTransition, finish]);
  const onTap = () => (stage2.current ? finish() : startTransition());

  /* ----- layers: every style reads the same progress through frameAt ------------------- */
  const travellingP = useAnimatedStyle(() => {
    const f = frameAt(progressOf(x.value, W, motionOK), L);
    return { left: f.p.x, top: f.p.y, width: f.p.width, height: f.p.height, opacity: f.p.opacity };
  });
  const wordmark = useAnimatedStyle(() => {
    const f = frameAt(progressOf(x.value, W, motionOK), L);
    return { width: f.wordmark.width, opacity: f.wordmark.opacity };
  });
  const fullLogo = useAnimatedStyle(() => ({
    opacity: frameAt(progressOf(x.value, W, motionOK), L).logoOpacity,
  }));

  // Each corner shape slides in from its own corner while fading up.
  const cs = L.cornerScale;
  const shift = (a: { width: number; height: number }, sx: number, sy: number) => ({
    x: sx * 0.22 * a.width * cs,
    y: sy * 0.22 * a.height * cs,
  });
  const tlShift = shift(BRAND.cornerTL, -1, -1);
  const trShift = shift(BRAND.cornerTR, 1, -1);
  const blShift = shift(BRAND.cornerBL, -1, 1);
  const brShift = shift(BRAND.cornerBR, 1, 1);
  const tl = useAnimatedStyle(() => {
    const e = frameAt(progressOf(x.value, W, motionOK), L).corners;
    return {
      opacity: e,
      transform: [{ translateX: (1 - e) * tlShift.x }, { translateY: (1 - e) * tlShift.y }],
    };
  });
  const tr = useAnimatedStyle(() => {
    const e = frameAt(progressOf(x.value, W, motionOK), L).corners;
    return {
      opacity: e,
      transform: [{ translateX: (1 - e) * trShift.x }, { translateY: (1 - e) * trShift.y }],
    };
  });
  const bl = useAnimatedStyle(() => {
    const e = frameAt(progressOf(x.value, W, motionOK), L).corners;
    return {
      opacity: e,
      transform: [{ translateX: (1 - e) * blShift.x }, { translateY: (1 - e) * blShift.y }],
    };
  });
  const br = useAnimatedStyle(() => {
    const e = frameAt(progressOf(x.value, W, motionOK), L).corners;
    return {
      opacity: e,
      transform: [{ translateX: (1 - e) * brShift.x }, { translateY: (1 - e) * brShift.y }],
    };
  });
  const size = (a: { width: number; height: number }) => ({
    width: a.width * cs,
    height: a.height * cs,
  });

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <StatusBar style="dark" />
      <PaperBackground />

      {/* decorations (purely visual: hidden from screen readers) */}
      <View pointerEvents="none" style={FILL} importantForAccessibility="no-hide-descendants">
        <Animated.Image
          source={brandAssets.cornerTL}
          resizeMode="stretch"
          style={[{ position: 'absolute', left: 0, top: 0 }, size(BRAND.cornerTL), tl]}
        />
        <Animated.Image
          source={brandAssets.cornerTR}
          resizeMode="stretch"
          style={[{ position: 'absolute', right: 0, top: 0 }, size(BRAND.cornerTR), tr]}
        />
        <Animated.Image
          source={brandAssets.cornerBL}
          resizeMode="stretch"
          style={[{ position: 'absolute', left: 0, bottom: 0 }, size(BRAND.cornerBL), bl]}
        />
        <Animated.Image
          source={brandAssets.cornerBR}
          resizeMode="stretch"
          style={[{ position: 'absolute', right: 0, bottom: 0 }, size(BRAND.cornerBR), br]}
        />
      </View>

      {/* the logo layers share one rectangle; the travelling P is on top of them */}
      <View pointerEvents="none" style={FILL} importantForAccessibility="no-hide-descendants">
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: L.logo.x,
              top: L.logo.y,
              height: L.logo.height,
              overflow: 'hidden',
            },
            wordmark,
          ]}
        >
          <Animated.Image
            source={brandAssets.wordmark}
            resizeMode="stretch"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: L.logo.width,
              height: L.logo.height,
            }}
          />
        </Animated.View>
        <Animated.Image
          source={brandAssets.logo}
          resizeMode="stretch"
          style={[
            {
              position: 'absolute',
              left: L.logo.x,
              top: L.logo.y,
              width: L.logo.width,
              height: L.logo.height,
            },
            fullLogo,
          ]}
        />
        <Animated.Image
          source={brandAssets.pSymbol}
          resizeMode="stretch"
          style={[{ position: 'absolute' }, travellingP]}
        />
      </View>

      {/* tap surface: transparent, skips ahead */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="PANDAM MAATRAM, the modern barter app. Tap to continue."
        onPress={onTap}
        style={FILL}
      />
    </View>
  );
}
