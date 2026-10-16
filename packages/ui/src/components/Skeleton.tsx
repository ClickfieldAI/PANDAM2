import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  type DimensionValue,
  Easing,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';

import { Gradient } from './Gradient';

const SWEEP_WIDTH = 160;

const sweepFrame = {
  position: 'absolute' as const,
  top: 0,
  bottom: 0,
  left: 0,
  width: SWEEP_WIDTH,
};

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A placeholder block with a light sweep travelling across it.
 *
 * The sweep (rather than an opacity pulse) is what makes a loading screen read
 * as "content is on its way" instead of "the app is stuck". It is suppressed
 * entirely when the reader has asked the OS to reduce motion: a looping
 * animation is exactly the kind of thing that setting exists to stop, and a
 * still grey block communicates the same thing.
 */
export function Skeleton({ width = '100%', height = 16, radius = radii.sm, style }: SkeletonProps) {
  const colors = useThemeColors();

  // Lazy state, not a ref: the value is read during render, which the
  // react-hooks/refs rule forbids for refs.
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceMuted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {reduceMotion ? null : (
        <Animated.View
          style={{
            ...sweepFrame,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-260, 260],
                }),
              },
            ],
          }}
        >
          <Gradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)']}
            direction="horizontal"
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** A skeleton shaped like a listing/need card. */
export function SkeletonCard() {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        padding: spacing.md,
        gap: spacing.md,
        backgroundColor: colors.surface,
        flexDirection: 'row',
      }}
    >
      <Skeleton width={76} height={76} radius={radii.md} />
      <View style={{ flex: 1, gap: spacing.sm, justifyContent: 'center' }}>
        <Skeleton width={58} height={13} radius={radii.pill} />
        <Skeleton width="78%" height={15} />
        <Skeleton width="52%" height={12} />
      </View>
    </View>
  );
}

/** A skeleton shaped like a grid tile. */
export function SkeletonTile() {
  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <Skeleton height={116} radius={radii.lg} />
      <Skeleton width="82%" height={14} />
      <Skeleton width="46%" height={12} />
    </View>
  );
}

/**
 * Placeholder lines for a block of prose. Widths taper so the block reads as
 * a paragraph rather than a stack of identical bars.
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '96%', '88%', '72%', '60%'] as const;
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} height={13} />
      ))}
    </View>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  const rows = Array.from({ length: Math.ceil(count / 2) }, (_, i) => i);
  return (
    <View style={{ gap: spacing.lg }}>
      {rows.map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: spacing.md }}>
          <SkeletonTile />
          <SkeletonTile />
        </View>
      ))}
    </View>
  );
}
