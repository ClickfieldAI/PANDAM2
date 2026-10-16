import { type ReactNode, useEffect } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '../theme';
import { ambient, shadows, springs } from '../tokens';
import { type ThemeColors } from '../tokens';

import { ALLOW_3D } from './allow3d';
import { useMotionOK } from './useMotionOK';

export interface ConnectingPairProps {
  /** What you have — slides in from the left. */
  left: ReactNode;
  /** What they have — slides in from the right. */
  right: ReactNode;
  /** The node drawn where the two meet (an exchange glyph). */
  link?: ReactNode;
  /** Size of each object tile. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The flagship "objects connecting" moment: two item tiles tilt in from either
 * side in 3D, settle facing each other, and a sage link pulses between them.
 * Under reduced motion the pair simply renders at rest.
 */
export function ConnectingPair({ left, right, link, size = 96, style }: ConnectingPairProps) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const enter = useSharedValue(motionOK ? 0 : 1);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!motionOK) {
      enter.value = 1;
      return undefined;
    }
    enter.value = withSpring(1, springs.enter);
    pulse.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: ambient.pulse / 2, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: ambient.pulse / 2, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [motionOK, enter, pulse]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [
      { perspective: 700 },
      { translateX: interpolate(enter.value, [0, 1], [-size * 0.6, 0]) },
      { rotateY: `${ALLOW_3D ? interpolate(enter.value, [0, 1], [-50, 14]) : 0}deg` },
      { rotateZ: `${interpolate(enter.value, [0, 1], [-10, -4])}deg` },
    ],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [
      { perspective: 700 },
      { translateX: interpolate(enter.value, [0, 1], [size * 0.6, 0]) },
      { rotateY: `${ALLOW_3D ? interpolate(enter.value, [0, 1], [50, -14]) : 0}deg` },
      { rotateZ: `${interpolate(enter.value, [0, 1], [10, 4])}deg` },
    ],
  }));
  const linkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.7, 1], [0, 0, 1]),
    transform: [{ scale: 1 + pulse.value * 0.12 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.9 }],
  }));

  const tile = { width: size, height: size, borderRadius: size * 0.22 };

  return (
    <View style={[makeStyles(colors).row, style]}>
      <Animated.View style={[makeStyles(colors).tile, tile, shadows.md, leftStyle]}>
        {left}
      </Animated.View>
      <View style={makeStyles(colors).linkWrap}>
        <Animated.View style={[makeStyles(colors).halo, haloStyle]} />
        <Animated.View style={[makeStyles(colors).link, linkStyle]}>{link}</Animated.View>
      </View>
      <Animated.View style={[makeStyles(colors).tile, tile, shadows.md, rightStyle]}>
        {right}
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    tile: {
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 3,
      borderColor: colors.surface,
    },
    linkWrap: {
      width: 44,
      height: 44,
      marginHorizontal: -10,
      zIndex: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    halo: {
      position: 'absolute',
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.matchBright,
    },
    link: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.match,
      borderWidth: 3,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
  });
