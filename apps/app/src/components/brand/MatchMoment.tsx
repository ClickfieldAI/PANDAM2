import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, palette, radii, spacing, useMotionOK, ALLOW_3D, useThemeColors } from '@pandam/ui';

import { OrganicShape } from './OrganicShape';
import { ParticleBurst } from './ParticleBurst';
import { PhotoObject } from './PhotoObject';

function Obj({
  side,
  uri,
  seed,
  meet,
  size,
}: {
  side: 'left' | 'right';
  uri?: string;
  seed: string;
  meet: SharedValue<number>;
  size: number;
}) {
  const d = side === 'left' ? -1 : 1;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(meet.value, [0, 0.3], [0, 1], 'clamp'),
    transform: [
      { perspective: 800 },
      { translateX: d * interpolate(meet.value, [0, 1], [size * 1.2, size * 0.58]) },
      { translateY: interpolate(meet.value, [0, 1], [30, 0]) },
      { rotateY: `${ALLOW_3D ? d * interpolate(meet.value, [0, 1], [60, 18]) : 0}deg` },
      { rotateZ: `${d * interpolate(meet.value, [0, 1], [18, 5])}deg` },
      { scale: interpolate(meet.value, [0, 1], [0.7, 1]) },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style]}>
      <PhotoObject uri={uri} seed={seed} style={{ flex: 1 }} radius={radii.xl} frame={6} />
    </Animated.View>
  );
}

/**
 * The "MATCH FOUND" moment. Sequence, all springs:
 *   1. your object and theirs sweep in from either side in 3D and meet,
 *   2. the exchange symbol pops in between them (and turns once),
 *   3. a soft terracotta burst of particles — one, not a confetti cannon,
 *   4. the headline and names rise in.
 * Plays once per visit. Under reduced motion it renders the settled frame.
 */
export function MatchMoment({
  youPhoto,
  themPhoto,
  youSeed,
  themSeed,
  them,
}: {
  youPhoto?: string;
  themPhoto?: string;
  youSeed: string;
  themSeed: string;
  them: string;
}) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const meet = useSharedValue(motionOK ? 0 : 1);
  const token = useSharedValue(motionOK ? 0 : 1);
  const burst = useSharedValue(0);
  const text = useSharedValue(motionOK ? 0 : 1);

  useEffect(() => {
    if (!motionOK) return;
    meet.value = withDelay(150, withSpring(1, { damping: 13, stiffness: 90, mass: 1 }));
    token.value = withDelay(650, withSpring(1, { damping: 9, stiffness: 160 }));
    burst.value = withDelay(
      700,
      withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );
    text.value = withDelay(850, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [motionOK, meet, token, burst, text]);

  const tokenStyle = useAnimatedStyle(() => ({
    opacity: token.value > 0.02 ? 1 : 0,
    transform: [{ scale: token.value }, { rotate: `${(1 - token.value) * -200}deg` }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: (1 - text.value) * 14 }],
  }));

  const size = 146;

  return (
    <View
      style={{
        alignItems: 'center',
        paddingTop: spacing.lg,
        paddingBottom: spacing.xl,
        overflow: 'hidden',
      }}
    >
      <OrganicShape size={300} color={colors.accentSoft} rotate={-10} style={{ top: 10 }} />
      <OrganicShape
        size={160}
        color={colors.accentSoft}
        rotate={20}
        style={{ right: 10, top: 150 }}
      />

      <View
        style={{ height: size + 40, width: '100%', alignItems: 'center', justifyContent: 'center' }}
      >
        <Obj side="left" uri={youPhoto} seed={youSeed} meet={meet} size={size} />
        <Obj side="right" uri={themPhoto} seed={themSeed} meet={meet} size={size} />
        <ParticleBurst burst={burst} />
        <Animated.View
          style={[
            {
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: colors.accent,
              borderWidth: 4,
              borderColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#5A3A22',
              shadowOpacity: 0.3,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
              zIndex: 5,
            },
            tokenStyle,
          ]}
        >
          <Ionicons name="swap-horizontal" size={26} color={colors.textInverse} />
        </Animated.View>
      </View>

      <Animated.View
        style={[{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.md }, textStyle]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: spacing.md,
            paddingVertical: 5,
            borderRadius: radii.pill,
            backgroundColor: colors.matchSoft,
            borderWidth: 1,
            borderColor: colors.matchBorder,
          }}
        >
          <Ionicons name="checkmark-circle" size={13} color={colors.match} />
          <Text
            style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: colors.matchText }}
          >
            MATCH FOUND
          </Text>
        </View>
        <Text
          style={{
            fontSize: 26,
            lineHeight: 31,
            fontWeight: '800',
            letterSpacing: -0.8,
            color: colors.textPrimary,
          }}
        >
          You and {them}
        </Text>
        <Text variant="bodySm" tone="secondary">
          You have what they need. They have what you need.
        </Text>
      </Animated.View>
    </View>
  );
}
