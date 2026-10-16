import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { Press, Text, useMotionOK, useThemeColors } from '@pandam/ui';

import type { Rect as TourRect } from './registry';
import type { TourStep } from './steps';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const SCRIM = 'rgba(17,17,17,0.74)';
/** Breathing room between the target and the spotlight edge. */
const PAD = 8;
const GAP = 14;
const RADIUS = 18;

export type TourPhase = 'idle' | 'welcome' | 'tour' | 'done';

interface Props {
  phase: TourPhase;
  step: TourStep | null;
  index: number;
  total: number;
  /** Measured target; null while the step is still navigating / measuring. */
  rect: TourRect | null;
  onStart: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onDismissDone: () => void;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();

  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingHorizontal: 22,
        borderRadius: 14,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 15, color: '#FFFFFF' }}>
        {label}
      </Text>
    </Press>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useThemeColors();
  const MUTED = colors.textMuted;

  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{ minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 14, color: MUTED }}>
        {label}
      </Text>
    </Press>
  );
}

/** Full-screen card used for the welcome and completion moments. */
function Card({
  icon,
  title,
  body,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const INK = colors.textPrimary;
  const MUTED = colors.textMuted;

  const motionOK = useMotionOK();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
      <Animated.View
        entering={motionOK ? FadeInDown.duration(320).easing(Easing.out(Easing.cubic)) : undefined}
        style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 420,
          backgroundColor: colors.background,
          borderRadius: 28,
          padding: 24,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={28} color="#FFFFFF" />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: 'InterTight_900Black',
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -0.8,
            color: INK,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: 'InterTight_400Regular',
            fontSize: 15.5,
            lineHeight: 22,
            color: MUTED,
          }}
        >
          {body}
        </Text>
        <View style={{ marginTop: 6, gap: 4 }}>{children}</View>
      </Animated.View>
    </View>
  );
}

export function TourOverlay({
  phase,
  step,
  index,
  total,
  rect,
  onStart,
  onNext,
  onPrev,
  onSkip,
  onFinish,
  onDismissDone,
}: Props) {
  const colors = useThemeColors();
  const INK = colors.textPrimary;
  const MUTED = colors.textMuted;

  const insets = useSafeAreaInsets();
  const motionOK = useMotionOK();
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Spotlight geometry — animated so it glides between steps.
  const hx = useSharedValue(0);
  const hy = useSharedValue(0);
  const hw = useSharedValue(0);
  const hh = useSharedValue(0);
  const hasRect = useSharedValue(0);

  useEffect(() => {
    if (!rect) return;
    const t = {
      x: rect.x - PAD,
      y: rect.y - PAD,
      w: rect.width + PAD * 2,
      h: rect.height + PAD * 2,
    };
    const first = hasRect.value === 0;
    const anim = (v: number) =>
      motionOK && !first ? withTiming(v, { duration: 300, easing: Easing.out(Easing.cubic) }) : v;
    hx.set(anim(t.x));
    hy.set(anim(t.y));
    hw.set(anim(t.w));
    hh.set(anim(t.h));
    hasRect.set(withTiming(1, { duration: motionOK ? 200 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, motionOK]);

  useEffect(() => {
    // Leaving the spotlight phase: the next tour starts fresh (no glide from
    // a stale position).
    if (phase !== 'tour') hasRect.set(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Android back closes the tour instead of leaving the screen underneath.
  useEffect(() => {
    // Hardware back only exists on native; BackHandler throws on web.
    if (phase === 'idle' || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'done') onDismissDone();
      else onSkip();
      return true;
    });
    return () => sub.remove();
  }, [phase, onSkip, onDismissDone]);

  const holeProps = useAnimatedProps(() => ({
    x: hx.value,
    y: hy.value,
    width: hw.value,
    height: hh.value,
    opacity: hasRect.value,
  }));
  const ringProps = useAnimatedProps(() => ({
    x: hx.value,
    y: hy.value,
    width: hw.value,
    height: hh.value,
    opacity: hasRect.value,
  }));

  if (phase === 'idle') return null;

  const spotlight = phase === 'tour';

  // Tooltip goes on whichever side of the target has more room.
  let tooltipPos: { top?: number; bottom?: number } = { bottom: insets.bottom + 24 };
  if (spotlight && rect && size.h > 0) {
    const below = size.h - (rect.y + rect.height + PAD);
    const above = rect.y - PAD;
    if (below >= above) tooltipPos = { top: rect.y + rect.height + PAD + GAP };
    else tooltipPos = { bottom: size.h - (rect.y - PAD) + GAP };
  }

  const last = index === total - 1;

  return (
    <Animated.View
      // Swallow every touch so the app underneath can't be used mid-tour.
      onStartShouldSetResponder={() => true}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      entering={motionOK ? FadeIn.duration(220) : undefined}
      exiting={motionOK ? FadeOut.duration(160) : undefined}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}
      accessibilityViewIsModal
    >
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h} pointerEvents="none" style={{ position: 'absolute' }}>
          <Defs>
            <Mask id="tour-hole">
              <Rect x={0} y={0} width={size.w} height={size.h} fill="white" />
              <AnimatedRect animatedProps={holeProps} rx={RADIUS} ry={RADIUS} fill="black" />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            fill={SCRIM}
            mask={spotlight ? 'url(#tour-hole)' : undefined}
          />
          {spotlight ? (
            <AnimatedRect
              animatedProps={ringProps}
              rx={RADIUS}
              ry={RADIUS}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
            />
          ) : null}
        </Svg>
      ) : null}

      {phase === 'welcome' ? (
        <Card
          icon="swap-horizontal"
          title="Welcome to PANDAM"
          body="Swap what you have for what you need. List something you can offer, post something you are looking for, and PANDAM finds reciprocal barters between people."
        >
          <PrimaryButton label="Start tour" onPress={onStart} />
          <View style={{ alignItems: 'center' }}>
            <TextButton label="Skip tour" onPress={onSkip} />
          </View>
        </Card>
      ) : null}

      {phase === 'done' ? (
        <Card
          icon="checkmark-done"
          title="You are all set"
          body="That is the tour. You can replay it any time from Profile → Take the app tour."
        >
          <PrimaryButton label="Start exploring" onPress={onDismissDone} />
        </Card>
      ) : null}

      {spotlight && step && rect ? (
        <Animated.View
          key={step.target}
          entering={motionOK ? FadeIn.duration(240).delay(60) : undefined}
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              paddingHorizontal: 16,
            },
            tooltipPos,
          ]}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: colors.background,
              borderRadius: 22,
              padding: 18,
              gap: 10,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text
                style={{
                  flex: 1,
                  fontFamily: 'InterTight_700Bold',
                  fontSize: 12,
                  letterSpacing: 1.2,
                  color: colors.accent,
                  textTransform: 'uppercase',
                }}
              >
                {`${index + 1} of ${total}`}
              </Text>
              <Press
                haptic="light"
                scale="sm"
                accessibilityRole="button"
                accessibilityLabel="Close tour"
                onPress={onSkip}
                hitSlop={8}
                style={{
                  width: 44,
                  height: 44,
                  marginTop: -10,
                  marginRight: -10,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={22} color={INK} />
              </Press>
            </View>

            <View style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: total }, (_, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: i <= index ? colors.accent : '#E4E2DC',
                  }}
                />
              ))}
            </View>

            <Text
              accessibilityRole="header"
              style={{
                fontFamily: 'InterTight_800ExtraBold',
                fontSize: 20,
                letterSpacing: -0.4,
                color: INK,
              }}
            >
              {step.title}
            </Text>
            <Text
              style={{
                fontFamily: 'InterTight_400Regular',
                fontSize: 14.5,
                lineHeight: 21,
                color: MUTED,
              }}
            >
              {step.body}
            </Text>
            <Text style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 14, color: INK }}>
              {step.action}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <TextButton label="Skip tour" onPress={onSkip} />
              <View style={{ flex: 1 }} />
              {index > 0 ? <TextButton label="Previous" onPress={onPrev} /> : null}
              <PrimaryButton
                label={last ? 'Finish tour' : 'Next'}
                onPress={last ? onFinish : onNext}
              />
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
