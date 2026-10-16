import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Press,
  Text,
  palette,
  radii,
  shadows,
  spacing,
  useMotionOK,
  ALLOW_3D,
  useThemeColors,
} from '@pandam/ui';

import { OrganicShape } from './OrganicShape';
import { PhotoObject } from './PhotoObject';

/** One travelling spark of terracotta "energy" between the two objects. */
function Spark({ t, delay, span }: { t: SharedValue<number>; delay: number; span: number }) {
  const colors = useThemeColors();

  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - delay) / 0.6));
    return {
      opacity: p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI),
      transform: [
        { translateX: -span / 2 + p * span },
        { translateY: -Math.sin(p * Math.PI) * 18 },
        { scale: 0.6 + Math.sin(p * Math.PI) * 0.6 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.accentBright,
          shadowColor: colors.accent,
          shadowOpacity: 0.6,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

function Side({
  kind,
  photo,
  seed,
  count,
  charge,
  onPress,
}: {
  kind: 'have' | 'need';
  photo?: string;
  seed: string;
  count: number;
  charge: SharedValue<number>;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  const have = kind === 'have';
  const dir = have ? 1 : -1;
  const objStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { translateX: charge.value * 16 * dir },
      { translateY: -charge.value * 6 },
      { rotateY: `${ALLOW_3D ? (have ? 14 : -14) - charge.value * 10 * dir : 0}deg` },
      { rotateZ: `${(have ? -6 : 6) + charge.value * 5 * dir}deg` },
      { scale: 1 + charge.value * 0.04 },
    ],
  }));

  return (
    <Press
      scale="sm"
      dim={false}
      accessibilityRole="button"
      accessibilityLabel={have ? 'Add something you have' : 'Add something you need'}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}
    >
      <Animated.View style={[{ width: '78%', aspectRatio: 1, maxWidth: 190 }, objStyle]}>
        <PhotoObject uri={photo} seed={seed} style={{ flex: 1 }} radius={radii.xl} frame={6} />
      </Animated.View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text
          style={{
            fontSize: 12,
            letterSpacing: 1.6,
            fontWeight: '800',
            color: have ? colors.accent : colors.needText,
          }}
        >
          {have ? 'I HAVE' : 'I NEED'}
        </Text>
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>
          {count} {have ? 'listed' : 'asked for'}
        </Text>
        <View
          style={{
            marginTop: spacing.xs,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: spacing.md,
            height: 30,
            borderRadius: radii.pill,
            backgroundColor: have ? colors.accent : colors.surface,
            borderWidth: have ? 0 : 1,
            borderColor: colors.accentBorder,
          }}
        >
          <Ionicons name="add" size={14} color={have ? colors.textInverse : colors.accent} />
          <Text
            variant="label"
            style={{ fontWeight: '700', color: have ? colors.textInverse : colors.accent }}
          >
            {have ? 'List a thing' : 'Ask for one'}
          </Text>
        </View>
      </View>
    </Press>
  );
}

/**
 * Home's hero: the whole idea of PANDAM in one gesture. Your thing on the
 * left, the thing you want on the right, the exchange between. Hover/press
 * (and once on arrival) charges the exchange: the objects lean in and turn
 * toward each other, the token spins, sparks of terracotta travel across,
 * then everything springs back to rest. Static under reduced motion.
 */
export function ExchangeHero({
  havePhoto,
  needPhoto,
  haveCount,
  needCount,
  onHave,
  onNeed,
}: {
  havePhoto?: string;
  needPhoto?: string;
  haveCount: number;
  needCount: number;
  onHave: () => void;
  onNeed: () => void;
}) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const charge = useSharedValue(0);
  const spark = useSharedValue(0);
  const spin = useSharedValue(0);

  const fire = useCallback(() => {
    if (!motionOK) return;
    charge.set(
      withSequence(
        withSpring(1, { damping: 12, stiffness: 140 }),
        withDelay(500, withSpring(0, { damping: 14, stiffness: 90 })),
      ),
    );
    spark.set(0);
    spark.set(withTiming(1.2, { duration: 1100, easing: Easing.inOut(Easing.cubic) }));
    spin.set(withSpring(spin.get() + 1, { damping: 12, stiffness: 100 }));
  }, [motionOK, charge, spark, spin]);

  useEffect(() => {
    const t = setTimeout(fire, 700);
    return () => clearTimeout(t);
  }, [fire]);

  const tokenStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.value * 180}deg` },
      { scale: 1 + interpolate(charge.value, [0, 1], [0, 0.18]) },
    ],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: charge.value * 0.5,
    transform: [{ scale: 1 + charge.value * 0.9 }],
  }));

  return (
    <View
      {...({ onPointerEnter: fire } as object)}
      style={{
        borderRadius: radii['2xl'],
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        paddingTop: spacing.xl,
        paddingBottom: spacing.lg,
        ...shadows.md,
      }}
    >
      <OrganicShape
        size={260}
        color={colors.accentSoft}
        rotate={-18}
        style={{ left: -60, top: -40 }}
      />
      <OrganicShape
        size={220}
        color={colors.surfaceMuted}
        rotate={30}
        style={{ right: -50, bottom: -30 }}
      />

      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        <Text
          style={{
            fontSize: 22,
            lineHeight: 27,
            fontWeight: '800',
            letterSpacing: -0.6,
            color: colors.textPrimary,
          }}
        >
          Trade what you have{'\n'}
          <Text
            style={{
              fontSize: 22,
              lineHeight: 27,
              fontWeight: '800',
              letterSpacing: -0.6,
              color: colors.accent,
            }}
          >
            for what you need.
          </Text>
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Side
          kind="have"
          photo={havePhoto}
          seed="have"
          count={haveCount}
          charge={charge}
          onPress={() => {
            fire();
            onHave();
          }}
        />
        <Side
          kind="need"
          photo={needPhoto}
          seed="need"
          count={needCount}
          charge={charge}
          onPress={() => {
            fire();
            onNeed();
          }}
        />

        {/* The exchange, centred between the two objects. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '26%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spark t={spark} delay={0} span={150} />
          <Spark t={spark} delay={0.18} span={150} />
          <Spark t={spark} delay={0.36} span={150} />
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.accentBright,
              },
              glowStyle,
            ]}
          />
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.accent,
              borderWidth: 4,
              borderColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              ...shadows.md,
            }}
          >
            <Animated.View style={tokenStyle}>
              <Ionicons name="swap-horizontal" size={22} color={colors.textInverse} />
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}
