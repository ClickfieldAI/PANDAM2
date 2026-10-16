import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, radii, useMotionOK, useThemeColors } from '@pandam/ui';

export const TAGLINE = 'Real things. New possibilities.';

/**
 * The PANDAM wordmark: a terracotta exchange mark (two arrows passing — the
 * trade itself) beside heavy, tightly-tracked caps. `reveal` plays the logo
 * reveal: the mark springs in and turns once, then the letters open from a
 * tighter tracking, then the tagline fades up.
 */
export function Wordmark({
  size = 'md',
  tagline = false,
  inverse = false,
  reveal = false,
  align = 'left',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tagline?: boolean;
  inverse?: boolean;
  reveal?: boolean;
  align?: 'left' | 'center';
}) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const animate = reveal && motionOK;
  const mark = useSharedValue(animate ? 0 : 1);
  const word = useSharedValue(animate ? 0 : 1);
  const line = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    mark.value = withSpring(1, { damping: 11, stiffness: 120 });
    word.value = withDelay(180, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    line.value = withDelay(520, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [animate, mark, word, line]);

  const S = { sm: 18, md: 26, lg: 40, xl: 56 }[size];
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.4 + mark.value * 0.6 }, { rotate: `${(1 - mark.value) * -180}deg` }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateX: (1 - word.value) * -10 }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: line.value,
    transform: [{ translateY: (1 - line.value) * 8 }],
  }));

  const ink = inverse ? colors.textInverse : colors.textPrimary;

  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start', gap: S * 0.28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S * 0.32 }}>
        <Animated.View
          style={[
            {
              width: S * 1.18,
              height: S * 1.18,
              borderRadius: S * 0.36,
              backgroundColor: inverse ? colors.surface : colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#5A3A22',
              shadowOpacity: 0.22,
              shadowRadius: S * 0.4,
              shadowOffset: { width: 0, height: S * 0.18 },
            },
            markStyle,
          ]}
        >
          <Ionicons
            name="swap-horizontal"
            size={S * 0.68}
            color={inverse ? colors.accent : colors.textInverse}
          />
        </Animated.View>
        <Animated.View style={wordStyle}>
          <Text
            style={{
              fontSize: S,
              lineHeight: S * 1.08,
              fontWeight: '800',
              letterSpacing: S * 0.06,
              color: ink,
            }}
          >
            PANDAM
          </Text>
        </Animated.View>
      </View>
      {tagline ? (
        <Animated.View style={lineStyle}>
          <Text
            style={{
              fontSize: Math.max(13, S * 0.36),
              lineHeight: Math.max(18, S * 0.48),
              fontWeight: '500',
              letterSpacing: 0.1,
              color: inverse ? 'rgba(255,253,249,0.8)' : colors.textSecondary,
              textAlign: align === 'center' ? 'center' : 'left',
            }}
          >
            {TAGLINE}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Small reusable pill that says what the brand does, used on auth. */
export function BrandPill({ label }: { label: string }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text variant="caption" tone="secondary" style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}
