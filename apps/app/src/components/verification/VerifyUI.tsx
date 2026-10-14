/**
 * Visual building blocks for the identity-verification flow, built to the
 * supplied reference screens: a heavy black title, red rows, a wide red CTA and
 * asymmetric red / concrete decoration at the screen edges.
 *
 * Presentation only — the verification logic lives in the screens and in
 * `@/lib/verification`. Decoration is drawn with SVG (blobs, lens) plus the
 * bundled concrete cut-out, always behind content and never touchable.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { Press, useMotionOK } from '@pandam/ui';

import { M } from '@/components/matches/MatchesUI';

export const PAD = 22;
const TITLE = 'InterTight_900Black';
const BOLD = 'InterTight_700Bold';
const SEMI = 'InterTight_600SemiBold';
const REG = 'InterTight_400Regular';
const concrete = require('../../../assets/matches/concrete.webp') as number;

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------ decoration ------------------------------- */

/** Different organic silhouettes so no two screens reuse the same shape. */
const BLOBS = {
  round: 'M60,6 C96,-2 124,26 118,62 C112,98 80,118 46,108 C12,98 -6,60 12,32 C22,16 40,10 60,6 Z',
  tall: 'M70,4 C108,-6 132,40 120,84 C112,114 84,138 52,126 C16,112 -2,70 14,36 C24,16 48,8 70,4 Z',
  wave: 'M0,140 L0,86 C30,98 62,92 96,66 C132,38 176,40 210,0 L210,140 Z',
  lobe: 'M30,10 C70,-8 130,2 144,48 C156,88 118,104 100,128 C84,150 52,146 38,120 C28,100 40,84 22,68 C0,50 -4,24 30,10 Z',
} as const;
export type BlobKind = keyof typeof BLOBS;

export function RedShape({
  kind,
  width,
  height,
  color = M.red,
  style,
}: {
  kind: BlobKind;
  width: number;
  height: number;
  color?: string;
  style?: object;
}) {
  const vb = kind === 'wave' ? '0 0 210 140' : kind === 'tall' ? '0 0 134 140' : '0 0 150 150';
  return (
    <View pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <Svg width={width} height={height} viewBox={vb} preserveAspectRatio="none">
        <Path d={BLOBS[kind]} fill={color} />
      </Svg>
    </View>
  );
}

export function Concrete({
  size,
  rotate = 0,
  style,
}: {
  size: number;
  rotate?: number;
  style?: object;
}) {
  return (
    <Image
      source={concrete}
      resizeMode="contain"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size * 0.89,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    />
  );
}

/** A grey faceted slab with a black lens, suggesting a camera body (decorative). */
export function CameraShape({ size, style }: { size: number; style?: object }) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <Svg width={size} height={size * 1.25} viewBox="0 0 160 200">
        <Path d="M60,10 L150,40 L160,150 L70,190 Z" fill="#CFCDC8" />
        <Path d="M60,10 L150,40 L120,70 L40,40 Z" fill="#E9E7E2" />
        <G>
          <Ellipse cx="62" cy="104" rx="56" ry="72" fill="#161616" />
          <Ellipse cx="62" cy="104" rx="42" ry="56" fill="#0B0B0B" />
          <Ellipse cx="62" cy="104" rx="26" ry="36" fill="#1B1B1B" />
          <Ellipse cx="54" cy="92" rx="9" ry="13" fill="#2C2C2C" />
        </G>
      </Svg>
    </View>
  );
}

/** Behind-content decoration layer, clipped to the screen. */
export function DecorLayer({ children }: { children: ReactNode }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {children}
    </View>
  );
}

/* -------------------------------- structure -------------------------------- */

/**
 * Screen shell: off-white page, safe areas, optional back arrow, decoration
 * behind a scrolling column (so small phones can still reach every button).
 */
export function VerifyShell({
  decor,
  onBack,
  children,
  center = false,
}: {
  decor?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  /** Vertically centre the content (the status screens). */
  center?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: M.bg }}>
      {decor ? <DecorLayer>{decor}</DecorLayer> : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: PAD,
          justifyContent: center ? 'center' : 'flex-start',
        }}
      >
        {onBack ? (
          <Press
            haptic="light"
            scale="lg"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={12}
            style={{ width: 36, height: 36, justifyContent: 'center', marginLeft: -4 }}
          >
            <Ionicons name="chevron-back" size={24} color={M.ink} />
          </Press>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

export function PageTitle({ children, size = 42 }: { children: string; size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: TITLE,
        fontSize: size,
        lineHeight: size + 2,
        letterSpacing: -size * 0.052,
        color: M.ink,
        marginTop: 6,
      }}
    >
      {children}
    </Text>
  );
}

export function Lead({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text
      style={[
        { fontFamily: REG, fontSize: 15.5, lineHeight: 22, color: '#444444', marginTop: 14 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Pale-pink rounded square holding a red line icon. */
export function IconTile({ name }: { name: IconName }) {
  return (
    <View
      style={{
        width: 76,
        height: 76,
        borderRadius: 14,
        backgroundColor: M.pink,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
      }}
    >
      <Ionicons name={name} size={44} color={M.red} />
      {name === 'phone-portrait-outline' ? (
        <Ionicons
          name="lock-closed"
          size={14}
          color={M.red}
          style={{ position: 'absolute', top: 34 }}
        />
      ) : null}
    </View>
  );
}

export function RedRow({
  icon,
  children,
  bold = false,
}: {
  icon: IconName;
  children: string;
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 26, alignItems: 'center' }}>
        <Ionicons name={icon} size={23} color={M.red} />
      </View>
      <Text
        style={{ flex: 1, fontFamily: bold ? SEMI : REG, fontSize: 15.5, color: M.ink }}
        numberOfLines={2}
      >
        {children}
      </Text>
    </View>
  );
}

/** Rounded, thin-bordered note with a lock. */
export function NoteBox({ children }: { children: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C9C7C2',
        backgroundColor: '#EDEBE6',
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Ionicons name="lock-closed" size={19} color="#5A5A5A" />
      <Text style={{ flex: 1, fontFamily: REG, fontSize: 13.5, lineHeight: 19, color: '#555555' }}>
        {children}
      </Text>
    </View>
  );
}

/** Bordered panel with a small heading (authorization). */
export function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1.4,
        borderColor: M.ink,
        backgroundColor: M.bg,
        padding: 16,
        gap: 14,
      }}
    >
      <Text style={{ fontFamily: BOLD, fontSize: 15, color: M.ink }}>{title}</Text>
      {children}
    </View>
  );
}

/** The wide red call-to-action, with an arrow at its right edge. */
export function WideCta({
  label,
  onPress,
  arrow = true,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  arrow?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      states={{ pressed: { backgroundColor: M.redPressed } }}
      style={{
        height: 54,
        borderRadius: 10,
        borderWidth: 1.2,
        borderColor: '#3A1410',
        backgroundColor: M.red,
        opacity: disabled ? 0.5 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{ flex: 1, textAlign: 'center', fontFamily: SEMI, fontSize: 16.5, color: '#fff' }}
      >
        {loading ? 'Please wait…' : label}
      </Text>
      {arrow ? (
        <Ionicons
          name="arrow-forward"
          size={22}
          color="#FFFFFF"
          style={{ position: 'absolute', right: 18 }}
        />
      ) : null}
    </Press>
  );
}

export function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      haptic="light"
      scale="md"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={{ alignSelf: 'center', paddingVertical: 10 }}
    >
      <Text style={{ fontFamily: SEMI, fontSize: 15.5, color: M.ink }}>{label}</Text>
    </Press>
  );
}

/* ------------------------------ status pieces ------------------------------ */

export function SuccessBadge({ shield = false, size = 132 }: { shield?: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: M.red,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
      }}
    >
      {shield ? (
        <Ionicons name="shield-checkmark-outline" size={size * 0.5} color="#fff" />
      ) : (
        <Ionicons name="checkmark" size={size * 0.56} color="#fff" />
      )}
    </View>
  );
}

export function CenterTitle({ children, size = 36 }: { children: string; size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      style={{
        fontFamily: TITLE,
        fontSize: size,
        lineHeight: size + 3,
        letterSpacing: -1.8,
        color: M.ink,
        textAlign: 'center',
      }}
    >
      {children}
    </Text>
  );
}

export function CenterBody({ children }: { children: string }) {
  return (
    <Text
      style={{ fontFamily: REG, fontSize: 15, lineHeight: 21, color: '#444', textAlign: 'center' }}
    >
      {children}
    </Text>
  );
}

/** Eight-spoke spinner inside a pale-pink disc. */
export function SpinnerDisc() {
  const motionOK = useMotionOK();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!motionOK) return undefined;
    turn.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [motionOK, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const spokes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Verifying"
      style={{
        width: 86,
        height: 86,
        borderRadius: 43,
        backgroundColor: M.pink,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
      }}
    >
      <Animated.View style={spin}>
        <Svg width={44} height={44} viewBox="0 0 44 44">
          {spokes.map((i) => (
            <Rect
              key={i}
              x={20}
              y={2}
              width={4}
              height={11}
              rx={2}
              fill={M.red}
              opacity={0.25 + (i / 7) * 0.75}
              transform={`rotate(${i * 45} 22 22)`}
            />
          ))}
          <Circle cx="22" cy="22" r="0.1" fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Account — Identity — Complete. Each stage is done (red check), current (red
 * disc with its number) or upcoming (outlined, dark number). A connector is red
 * once the stage on its left is done, dark otherwise.
 */
export function ProgressSteps({
  identityDone,
  completeDone,
}: {
  identityDone: boolean;
  completeDone: boolean;
}) {
  const state = (done: boolean, prevDone: boolean) =>
    done ? 'done' : prevDone ? 'current' : 'upcoming';
  const steps = [
    { label: 'Account', n: 1, st: 'done' as const },
    { label: 'Identity', n: 2, st: state(identityDone, true) },
    { label: 'Complete', n: 3, st: state(completeDone, identityDone) },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {steps.map((s, i) => {
        const filled = s.st !== 'upcoming';
        return (
          <View
            key={s.label}
            style={{ flexDirection: 'row', alignItems: 'center', flex: i < 2 ? 1 : undefined }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: filled ? M.red : 'transparent',
                borderWidth: filled ? 0 : 1.6,
                borderColor: M.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {s.st === 'done' ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Text style={{ fontFamily: BOLD, fontSize: 13, color: filled ? '#fff' : M.ink }}>
                  {s.n}
                </Text>
              )}
            </View>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: SEMI,
                fontSize: 13.5,
                color: filled ? M.red : '#555',
                marginLeft: 7,
              }}
            >
              {s.label}
            </Text>
            {i < 2 ? (
              <View
                style={{
                  flex: 1,
                  minWidth: 8,
                  height: 1.5,
                  backgroundColor: s.st === 'done' ? M.red : M.ink,
                  marginHorizontal: 8,
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** One summary row: red check, dark label, right-aligned red status. */
export function SummaryRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: ok ? M.red : 'transparent',
          borderWidth: ok ? 0 : 1.5,
          borderColor: '#B9B7B2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {ok ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: SEMI, fontSize: 16, color: M.ink, marginLeft: 14 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: BOLD, fontSize: 15.5, color: ok ? M.red : '#777' }}>{status}</Text>
    </View>
  );
}

/** A viewport-relative helper so decoration scales with the phone. */
export function useScreen() {
  const { width, height } = useWindowDimensions();
  return { w: width, h: height };
}
