import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, palette, radii, spacing, useMotionOK, ALLOW_3D, useThemeColors } from '@pandam/ui';

import { OrganicShape } from './OrganicShape';
import { ParticleBurst } from './ParticleBurst';
import { PhotoObject } from './PhotoObject';

interface Slot {
  id: string;
  title: string;
  photo?: string;
}

/**
 * YOU GIVE ↔ YOU GET, as objects on a stage. The give slot is an empty,
 * dashed tray until a listing is picked; then the photo springs in with a
 * slight over-rotation and settles. While the offer is sending, both objects
 * pull toward the centre and the exchange token spins — the trade physically
 * "happening". Once it is `sent`, the objects meet, the token turns into a
 * sage check with one terracotta burst, and "Trade proposal sent" crossfades
 * over the titles (absolutely positioned, so nothing below moves) before the
 * existing success toast and navigation take over.
 */
export function TradeStage({
  give,
  get,
  sending,
  sent = false,
}: {
  give: Slot | null;
  get: Slot | null;
  sending: boolean;
  sent?: boolean;
}) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const giveIn = useSharedValue(give ? 1 : 0);
  const pull = useSharedValue(0);
  const spin = useSharedValue(0);
  const done = useSharedValue(0);
  const burst = useSharedValue(0);
  const [width, setWidth] = useState(0);

  const giveId = give?.id ?? null;
  useEffect(() => {
    if (!motionOK) {
      giveIn.set(giveId ? 1 : 0);
      return;
    }
    giveIn.set(0);
    if (giveId) giveIn.set(withSpring(1, { damping: 10, stiffness: 140 }));
  }, [giveId, motionOK, giveIn]);

  useEffect(() => {
    if (sent) {
      cancelAnimation(spin);
      spin.set(0);
      if (!motionOK) {
        pull.set(1);
        done.set(1);
        return undefined;
      }
      pull.set(withSpring(1.35, { damping: 13, stiffness: 150 }));
      done.set(withSpring(1, { damping: 12, stiffness: 160 }));
      burst.set(0);
      burst.set(withDelay(120, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })));
      return undefined;
    }
    if (!motionOK) return undefined;
    if (sending) {
      pull.set(withSpring(1, { damping: 12, stiffness: 120 }));
      spin.set(
        withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.cubic) }), -1),
      );
    } else {
      pull.set(withSpring(0));
      cancelAnimation(spin);
      spin.set(withSequence(withTiming(0, { duration: 0 })));
    }
    return undefined;
  }, [sending, sent, motionOK, pull, spin, done, burst]);

  const giveStyle = useAnimatedStyle(() => ({
    opacity: giveIn.get(),
    transform: [
      { perspective: 800 },
      { translateX: pull.get() * 22 },
      { scale: 0.6 + giveIn.get() * 0.4 },
      { rotateY: `${ALLOW_3D ? 14 - pull.get() * 10 : 0}deg` },
      { rotateZ: `${-6 + (1 - giveIn.get()) * -18}deg` },
    ],
  }));
  const getStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { translateX: -pull.get() * 22 },
      { rotateY: `${ALLOW_3D ? -14 + pull.get() * 10 : 0}deg` },
      { rotateZ: '6deg' },
    ],
  }));
  const tokenStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${spin.get() * 360}deg` },
      { scale: 1 + Math.min(pull.get(), 1) * 0.15 + done.get() * 0.12 },
    ],
  }));
  const tokenSent = useAnimatedStyle(() => ({ opacity: done.get() }));
  const sentLine = useAnimatedStyle(() => ({
    opacity: done.get(),
    transform: [{ translateY: (1 - Math.min(done.get(), 1)) * 8 }],
  }));

  // Each column is 44% of the stage; keep the photo inside it at every width
  // (a fixed 128 overflowed its column on 320px phones).
  const box = width ? Math.max(92, Math.min(128, Math.floor(width * 0.44) - 10)) : 128;

  const label = (text: string, tone: 'give' | 'get') => (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: tone === 'give' ? colors.accent : colors.needText,
      }}
    >
      {text}
    </Text>
  );

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        borderRadius: radii['2xl'],
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.xl,
        overflow: 'hidden',
        shadowColor: '#5A3A22',
        shadowOpacity: 0.1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <OrganicShape
        size={240}
        color={colors.accentSoft}
        rotate={-14}
        style={{ left: -50, top: -30 }}
      />
      <OrganicShape
        size={200}
        color={colors.surfaceMuted}
        rotate={22}
        style={{ right: -40, bottom: -40 }}
      />

      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around' }}
      >
        <View style={{ alignItems: 'center', gap: spacing.sm, width: '44%' }}>
          {label('YOU GIVE', 'give')}
          <View style={{ width: box, height: box }}>
            {give ? null : (
              <View
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: radii.xl,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: colors.accentBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.accentBright} />
                <Text variant="caption" tone="muted">
                  Pick below
                </Text>
              </View>
            )}
            {give ? (
              <Animated.View style={[{ flex: 1 }, giveStyle]}>
                <PhotoObject uri={give.photo} seed={give.id} style={{ flex: 1 }} frame={5} />
              </Animated.View>
            ) : null}
          </View>
          <Text variant="label" numberOfLines={2} center style={{ minHeight: 34 }}>
            {give?.title ?? ' '}
          </Text>
        </View>

        <View style={{ alignItems: 'center', gap: spacing.sm, width: '44%' }}>
          {label('YOU GET', 'get')}
          <Animated.View style={[{ width: box, height: box }, getStyle]}>
            <PhotoObject uri={get?.photo} seed={get?.id ?? 'get'} style={{ flex: 1 }} frame={5} />
          </Animated.View>
          <Text variant="label" numberOfLines={2} center style={{ minHeight: 34 }}>
            {get?.title ?? ' '}
          </Text>
        </View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 26 + box / 2 - 24,
            alignItems: 'center',
          }}
        >
          <Animated.View
            style={[
              {
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: give ? colors.accent : colors.surface,
                borderWidth: give ? 4 : 1.5,
                borderColor: give ? colors.surface : colors.accentBorder,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#5A3A22',
                shadowOpacity: give ? 0.25 : 0.08,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
              },
              tokenStyle,
            ]}
          >
            <Ionicons
              name="swap-horizontal"
              size={20}
              color={give ? colors.textInverse : colors.accent}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  inset: -4,
                  borderRadius: 24,
                  borderWidth: 4,
                  borderColor: colors.surface,
                  backgroundColor: colors.match,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                tokenSent,
              ]}
            >
              <Ionicons name="checkmark" size={22} color={colors.textInverse} />
            </Animated.View>
          </Animated.View>
          <View
            style={{
              position: 'absolute',
              top: 24,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ParticleBurst burst={burst} />
          </View>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        accessibilityLiveRegion="polite"
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: spacing.sm,
            paddingBottom: spacing.xl,
            alignItems: 'center',
            gap: 2,
            backgroundColor: colors.surface,
          },
          sentLine,
        ]}
      >
        {sent ? (
          <>
            <Text
              style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.8, color: colors.accent }}
            >
              TRADE PROPOSAL SENT
            </Text>
            <Text variant="caption" tone="secondary">
              You will hear when they reply.
            </Text>
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}
