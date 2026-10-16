import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Button,
  Gradient,
  Text,
  gradients,
  palette,
  useMotionOK,
  ALLOW_3D,
  useThemeColors,
} from '@pandam/ui';

import { brandImages, type BrandImageKey } from '@/components/brand/imagery';
import { PhotoObject } from '@/components/brand/PhotoObject';
import { authKeys } from '@/lib/auth/hooks';

/** How long the splash may wait on the first auth check before offering a way out. */
const TIMEOUT_MS = 12_000;

/**
 * The splash is mounted from several places (AuthBootstrap, the index route,
 * both group layouts) while auth resolves, so it can unmount and remount
 * mid-intro. The intro must play exactly ONCE per app launch — a remount jumps
 * straight to the settled state instead of replaying from black.
 */
let introStartedAt: number | null = null;
const INTRO_MS = 2300;

const TILES: { img: BrandImageKey; angle: number; corner: [number, number]; tilt: number }[] = [
  { img: 'camera', angle: -135, corner: [-1, -1], tilt: -10 },
  { img: 'laptop', angle: -45, corner: [1, -1], tilt: 9 },
  { img: 'sneakers', angle: 45, corner: [1, 1], tilt: -7 },
  { img: 'headphones', angle: 135, corner: [-1, 1], tilt: 8 },
];
const TILE = 78;
const WORD = 'PANDAM';

/* -------------------------------------------------------------------------- */

/**
 * One product in the opening. Starts in its corner, springs in, then the four
 * travel onto an orbit and the whole ring turns half a revolution — every
 * object ends up where its opposite started, which IS a trade — before they
 * fold into the centre and become the mark.
 */
function Tile({
  spec,
  i,
  spread,
  radius,
  enter,
  orbit,
  collapse,
}: {
  spec: (typeof TILES)[number];
  i: number;
  spread: { x: number; y: number };
  radius: number;
  enter: SharedValue<number>;
  orbit: SharedValue<number>;
  collapse: SharedValue<number>;
}) {
  const a = (spec.angle * Math.PI) / 180;
  const sx = spec.corner[0] * spread.x;
  const sy = spec.corner[1] * spread.y;
  const cx = Math.cos(a) * radius;
  const cy = Math.sin(a) * radius;

  const style = useAnimatedStyle(() => {
    const o = orbit.value;
    const c = collapse.value;
    // Orbit half a turn: rotate the circle position by o * 180deg.
    const turn = o * Math.PI;
    const ox = cx * Math.cos(turn) - cy * Math.sin(turn);
    const oy = cx * Math.sin(turn) + cy * Math.cos(turn);
    // First third: glide from the corner onto the orbit; then ride it.
    const p = Math.min(1, o / 0.35);
    const x = (sx + (ox - sx) * p) * (1 - c);
    const y = (sy + (oy - sy) * p) * (1 - c);
    return {
      opacity: Math.min(1, enter.value * 1.4) * (1 - c * c),
      transform: [
        { translateX: x },
        { translateY: y + (1 - enter.value) * 40 },
        { perspective: 700 },
        { rotateY: `${ALLOW_3D ? (1 - enter.value) * 50 * spec.corner[0] : 0}deg` },
        { rotateZ: `${spec.tilt * (1 - p) + o * (i % 2 ? 14 : -14)}deg` },
        { scale: (0.55 + enter.value * 0.45) * (1 - c * 0.85) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: TILE, height: TILE, left: -TILE / 2, top: -TILE / 2 },
        style,
      ]}
    >
      <PhotoObject
        uri={brandImages[spec.img]}
        seed={spec.img}
        style={{ flex: 1 }}
        radius={16}
        frame={4}
      />
    </Animated.View>
  );
}

/** A letter of the wordmark, rising into place on its own beat. */
function Letter({ ch, i, reveal }: { ch: string; i: number; reveal: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(reveal.value, [i * 0.1, i * 0.1 + 0.5], [0, 1], 'clamp');
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 22 }, { scale: 0.9 + t * 0.1 }],
    };
  });
  return (
    <Animated.View style={style}>
      <Text
        style={{
          fontSize: 38,
          lineHeight: 44,
          fontWeight: '900',
          letterSpacing: 4,
          color: palette.white,
        }}
      >
        {ch}
      </Text>
    </Animated.View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Brand splash, shown while auth resolves.
 *
 * A dark espresso stage. Four real marketplace objects fly in from the
 * corners, lock onto an orbit and swap places (the trade, literally), then
 * fold into the centre as the terracotta exchange mark punches out with a
 * shockwave ring. PANDAM rises letter by letter, the tagline settles, and a
 * slim progress line keeps breathing until the session check finishes.
 *
 * If the first `me` check has not resolved after TIMEOUT_MS the progress line
 * is replaced by a quiet "couldn't reach PANDAM" state with Retry. The auth
 * logic itself is untouched — Retry only re-runs the existing session query.
 */
export function Splash() {
  const colors = useThemeColors();

  const { width, height } = useWindowDimensions();
  const qc = useQueryClient();
  const motionOK = useMotionOK();
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Decide once per mount whether to play or jump to the settled state.
  const [play] = useState(() => {
    if (!motionOK) return false;
    if (introStartedAt === null) {
      introStartedAt = Date.now();
      return true;
    }
    return Date.now() - introStartedAt < 150; // same-frame remount still plays
  });
  const settled = play ? 0 : 1;

  const enter = useSharedValue(settled);
  const orbit = useSharedValue(settled);
  const collapse = useSharedValue(settled);
  const mark = useSharedValue(settled);
  const spin = useSharedValue(settled);
  const ring = useSharedValue(settled ? 1 : 0);
  const reveal = useSharedValue(settled ? 2 : 0);
  const tagline = useSharedValue(settled);
  const breathe = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [attempt]);

  useEffect(() => {
    if (play) {
      const ease = Easing.bezier(0.65, 0, 0.35, 1);
      enter.value = withSpring(1, { damping: 13, stiffness: 120 });
      orbit.value = withDelay(420, withTiming(1, { duration: 900, easing: ease }));
      collapse.value = withDelay(
        1250,
        withTiming(1, { duration: 360, easing: Easing.in(Easing.cubic) }),
      );
      mark.value = withDelay(1450, withSpring(1, { damping: 9, stiffness: 150 }));
      spin.value = withDelay(
        1450,
        withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.4)) }),
      );
      ring.value = withDelay(
        1480,
        withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }),
      );
      reveal.value = withDelay(
        1600,
        withTiming(2, { duration: 700, easing: Easing.out(Easing.cubic) }),
      );
      tagline.value = withDelay(2050, withTiming(1, { duration: 500 }));
    }
    if (motionOK) {
      breathe.value = withDelay(
        play ? INTRO_MS : 0,
        withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true),
      );
      progress.value = withDelay(
        play ? INTRO_MS : 0,
        withRepeat(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
          -1,
          false,
        ),
      );
    }
    return () => {
      cancelAnimation(breathe);
      cancelAnimation(progress);
    };
  }, [
    play,
    motionOK,
    enter,
    orbit,
    collapse,
    mark,
    spin,
    ring,
    reveal,
    tagline,
    breathe,
    progress,
  ]);

  const retry = () => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
    void qc.refetchQueries({ queryKey: authKeys.me });
  };

  const spread = { x: Math.min(width * 0.32, 220), y: Math.min(height * 0.26, 240) };
  const radius = Math.min(width, height) * 0.2;

  const markStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, mark.value * 2),
    transform: [
      { scale: mark.value * (1 + breathe.value * 0.04) },
      { rotate: `${(1 - spin.value) * -200}deg` },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value <= 0 || ring.value >= 1 ? 0 : (1 - ring.value) * 0.9,
    transform: [{ scale: 0.6 + ring.value * 2.6 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (0.55 + breathe.value * 0.45) * mark.value,
    transform: [{ scale: 0.9 + mark.value * 0.1 + breathe.value * 0.06 }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: tagline.value,
    transform: [{ translateY: (1 - tagline.value) * 10 }],
  }));
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-60, 140]) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }}>
      <StatusBar style="light" />
      <Gradient
        colors={gradients.ink}
        direction="vertical"
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* stage: everything is positioned relative to the exact centre */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: width / 2, top: height / 2 - 40, width: 0, height: 0 }}
      >
        {/* warm halo behind the mark: stacked soft discs fake a radial glow */}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, haloStyle]}>
          {[
            { d: 420, o: 0.06 },
            { d: 300, o: 0.08 },
            { d: 200, o: 0.12 },
          ].map(({ d, o }) => (
            <View
              key={d}
              style={{
                position: 'absolute',
                width: d,
                height: d,
                left: -d / 2,
                top: -d / 2,
                borderRadius: d / 2,
                backgroundColor: palette.orange400,
                opacity: o,
              }}
            />
          ))}
        </Animated.View>
        {TILES.map((t, i) => (
          <Tile
            key={t.img}
            spec={t}
            i={i}
            spread={spread}
            radius={radius}
            enter={enter}
            orbit={orbit}
            collapse={collapse}
          />
        ))}
        {/* shockwave */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 96,
              height: 96,
              left: -48,
              top: -48,
              borderRadius: 48,
              borderWidth: 2,
              borderColor: palette.orange400,
            },
            ringStyle,
          ]}
        />
        {/* the mark */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 84,
              height: 84,
              left: -42,
              top: -42,
              borderRadius: 26,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              shadowColor: palette.orange600,
              shadowOpacity: 0.6,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 10 },
            },
            markStyle,
          ]}
        >
          <Ionicons name="swap-horizontal" size={46} color={palette.white} />
        </Animated.View>
      </View>

      {/* wordmark + tagline, just below the mark */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: height / 2 + 44,
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 24,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {WORD.split('').map((ch, i) => (
            <Letter key={i} ch={ch} i={i} reveal={reveal} />
          ))}
        </View>
        <Animated.View style={taglineStyle}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '500',
              letterSpacing: 0.3,
              color: 'rgba(255,253,249,0.62)',
              textAlign: 'center',
            }}
          >
            Real things. New possibilities.
          </Text>
        </Animated.View>

        {timedOut ? (
          <View style={{ marginTop: 28, alignItems: 'center', gap: 8, maxWidth: 300 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cloud-offline-outline" size={16} color="rgba(255,253,249,0.8)" />
              <Text variant="bodyStrong" style={{ color: palette.white }}>
                Couldn’t reach PANDAM
              </Text>
            </View>
            <Text variant="bodySm" center style={{ color: 'rgba(255,253,249,0.6)' }}>
              Check your connection, then try again. Nothing has been lost.
            </Text>
            <Button
              label="Retry"
              onPress={retry}
              style={{ marginTop: 8, alignSelf: 'center' }}
              leftIcon={<Ionicons name="refresh" size={16} color={colors.textInverse} />}
            />
          </View>
        ) : null}
      </View>

      {/* slim loader, bottom */}
      {!timedOut ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 64,
              alignSelf: 'center',
              width: 120,
              height: 3,
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: 'rgba(255,253,249,0.1)',
            },
            taglineStyle,
          ]}
        >
          <Animated.View
            style={[
              { width: 44, height: 3, borderRadius: 2, backgroundColor: palette.orange400 },
              barStyle,
            ]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Keep the splash up until the one-time intro has finished, so a fast session
 * check doesn't cut it off mid-flight. Pure presentation: `waiting` is still
 * the real auth gate, this only adds the remainder of the first-launch intro
 * (0 on every later mount, and 0 under reduced motion, which never plays it).
 */
export function useHoldSplash(waiting: boolean): boolean {
  const [holding, setHolding] = useState(
    () => introStartedAt !== null && introStartedAt + INTRO_MS + 200 > Date.now(),
  );
  useEffect(() => {
    if (!holding || introStartedAt === null) return undefined;
    const t = setTimeout(
      () => setHolding(false),
      Math.max(0, introStartedAt + INTRO_MS + 200 - Date.now()),
    );
    return () => clearTimeout(t);
  }, [holding]);
  return waiting || holding;
}
