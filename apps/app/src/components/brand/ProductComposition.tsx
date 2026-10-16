import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, palette, radii, spacing, useMotionOK, ALLOW_3D, useThemeColors } from '@pandam/ui';

import { brandImages, type BrandImageKey } from './imagery';
import { OrganicShape } from './OrganicShape';
import { PhotoObject } from './PhotoObject';

/* -------------------------------------------------------------------------- */

interface LayerSpec {
  img: BrandImageKey;
  /** Position/size as fractions of the composition box. */
  x: number;
  y: number;
  w: number;
  /** Resting Z rotation (deg) and Y rotation (deg) for perspective. */
  rz: number;
  ry: number;
  /** Parallax depth: foreground objects move more. */
  depth: number;
  z: number;
  label?: { text: string; tone: 'have' | 'need' };
}

/**
 * Art direction for each layout. Objects overlap and sit at different depths
 * on purpose — foreground camera, mid-layer headphones, sneakers on another
 * plane — so the result reads as a styled still life, not a grid of photos.
 */
const LAYOUTS: Record<'stack' | 'compact', LayerSpec[]> = {
  stack: [
    {
      img: 'laptop',
      x: 0.46,
      y: 0.02,
      w: 0.46,
      rz: 7,
      ry: -14,
      depth: 0.35,
      z: 1,
      label: { text: 'I NEED · MacBook', tone: 'need' },
    },
    { img: 'headphones', x: 0.04, y: 0.1, w: 0.4, rz: -9, ry: 16, depth: 0.55, z: 2 },
    { img: 'sneakers', x: 0.02, y: 0.55, w: 0.4, rz: 6, ry: 12, depth: 0.8, z: 3 },
    {
      img: 'camera',
      x: 0.36,
      y: 0.44,
      w: 0.5,
      rz: -5,
      ry: -10,
      depth: 1.2,
      z: 4,
      label: { text: 'I HAVE · Canon EOS', tone: 'have' },
    },
  ],
  compact: [
    { img: 'laptop', x: 0.58, y: 0.04, w: 0.36, rz: 8, ry: -14, depth: 0.35, z: 1 },
    { img: 'headphones', x: 0.03, y: 0.1, w: 0.32, rz: -10, ry: 14, depth: 0.55, z: 2 },
    { img: 'sneakers', x: 0.3, y: 0.44, w: 0.3, rz: 7, ry: 10, depth: 0.8, z: 3 },
    { img: 'camera', x: 0.31, y: 0.0, w: 0.38, rz: -4, ry: -8, depth: 1.2, z: 4 },
  ],
};

/**
 * Splash framing, computed in PIXELS from the measured box rather than as
 * fractions: objects are pinned to the four corners and sized so the top pair
 * ends above, and the bottom pair starts below, the wordmark's central band
 * (the middle ~34% of the height). Fractional positions let objects drift
 * into the wordmark on tall/narrow phones — this cannot.
 */
function scatterSpecs(w: number, h: number): LayerSpec[] {
  const band = h * 0.17; // half-height of the wordmark's keep-out band
  const room = h / 2 - band - h * 0.05; // vertical room available per corner
  const size = Math.max(64, Math.min(w * 0.3, room, 170));
  const mx = Math.max(12, w * 0.05);
  const topY = h * 0.05;
  const botY = h - size - h * 0.05;
  const px = (x: number) => x / w;
  const py = (y: number) => y / h;
  return [
    { img: 'headphones', x: px(mx), y: py(topY), w: size / w, rz: -10, ry: 14, depth: 0.6, z: 1 },
    {
      img: 'laptop',
      x: px(w - size - mx),
      y: py(topY + size * 0.18),
      w: size / w,
      rz: 9,
      ry: -14,
      depth: 0.4,
      z: 1,
    },
    {
      img: 'sneakers',
      x: px(mx),
      y: py(botY - size * 0.12),
      w: size / w,
      rz: 7,
      ry: 12,
      depth: 0.8,
      z: 1,
    },
    {
      img: 'camera',
      x: px(w - size - mx),
      y: py(botY),
      w: size / w,
      rz: -7,
      ry: -12,
      depth: 1.1,
      z: 1,
    },
  ];
}

/* -------------------------------------------------------------------------- */

function Layer({
  spec,
  box,
  index,
  px,
  py,
  motionOK,
}: {
  spec: LayerSpec;
  box: { w: number; h: number };
  index: number;
  px: SharedValue<number>;
  py: SharedValue<number>;
  motionOK: boolean;
}) {
  const colors = useThemeColors();

  const enter = useSharedValue(motionOK ? 0 : 1);
  const float = useSharedValue(0);

  useEffect(() => {
    if (!motionOK) {
      enter.set(1);
      return undefined;
    }
    // Staggered spring entrance: rise, un-rotate, settle.
    enter.set(
      withDelay(120 + index * 110, withSpring(1, { damping: 14, stiffness: 110, mass: 0.9 })),
    );
    float.set(
      withDelay(
        900 + index * 400,
        withRepeat(
          withTiming(1, { duration: 3400 + index * 500, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        ),
      ),
    );
    return () => cancelAnimation(float);
  }, [motionOK, index, enter, float]);

  const size = spec.w * box.w;
  const animated = useAnimatedStyle(() => {
    const f = float.value * 2 - 1;
    return {
      opacity: Math.min(1, enter.value * 1.6),
      transform: [
        { perspective: 900 },
        { translateX: px.value * 14 * spec.depth },
        { translateY: (1 - enter.value) * 60 + py.value * 10 * spec.depth - f * 6 * spec.depth },
        { scale: 0.82 + enter.value * 0.18 },
        { rotateY: `${ALLOW_3D ? spec.ry + px.value * 8 : 0}deg` },
        { rotateX: `${ALLOW_3D ? -py.value * 6 : 0}deg` },
        { rotateZ: `${spec.rz + (1 - enter.value) * spec.rz * 2 + f * 1.5}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: spec.x * box.w,
          top: spec.y * box.h,
          width: size,
          height: size,
          zIndex: spec.z,
        },
        animated,
      ]}
    >
      <PhotoObject
        uri={brandImages[spec.img]}
        seed={spec.img}
        style={{ flex: 1 }}
        radius={Math.max(12, size * 0.1)}
      />
      {spec.label ? (
        <View
          style={{
            position: 'absolute',
            left: -6,
            bottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: spacing.md,
            paddingVertical: 6,
            borderRadius: radii.pill,
            backgroundColor: spec.label.tone === 'have' ? colors.accent : colors.surface,
            shadowColor: '#5A3A22',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: spec.label.tone === 'have' ? palette.orange200 : colors.need,
            }}
          />
          <Text
            variant="caption"
            style={{
              fontWeight: '700',
              letterSpacing: 0.3,
              color: spec.label.tone === 'have' ? colors.textInverse : colors.textPrimary,
            }}
          >
            {spec.label.text}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

/** The exchange token that sits between HAVE and NEED — rotates and pulses. */
function ExchangeToken({ motionOK, size = 52 }: { motionOK: boolean; size?: number }) {
  const colors = useThemeColors();

  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!motionOK) return undefined;
    spin.set(
      withRepeat(
        withSequence(
          withDelay(1800, withSpring(1, { damping: 10, stiffness: 90 })),
          withDelay(1800, withSpring(0, { damping: 10, stiffness: 90 })),
        ),
        -1,
      ),
    );
    pulse.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1));
    return () => {
      cancelAnimation(spin);
      cancelAnimation(pulse);
    };
  }, [motionOK, spin, pulse]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.1 }],
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accentBright,
          },
          haloStyle,
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
          borderWidth: 4,
          borderColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#5A3A22',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        <Animated.View style={iconStyle}>
          <Ionicons name="swap-horizontal" size={size * 0.42} color={colors.textInverse} />
        </Animated.View>
      </View>
    </View>
  );
}

export interface ProductCompositionProps {
  layout?: 'stack' | 'compact' | 'scatter';
  height: number;
  /** Show the pulsing exchange token between the objects. */
  exchange?: boolean;
  /** Content drawn in the centre, above the shapes but under the objects (splash). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * PANDAM's signature still life: real products layered in space. Background
 * pebbles drift, objects float at different rates, and on web the whole scene
 * parallaxes with the pointer — nearer objects move more, which is what makes
 * it feel like depth rather than a collage. Static under reduced motion.
 */
export function ProductComposition({
  layout = 'stack',
  height,
  exchange = true,
  children,
  style,
}: ProductCompositionProps) {
  const motionOK = useMotionOK();
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  const box = useRef({ w: 1, h: height });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  }, []);

  const onMove = useCallback(
    (e: {
      nativeEvent: { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
    }) => {
      if (!motionOK) return;
      const n = e.nativeEvent;
      const x = n.offsetX ?? n.locationX ?? 0;
      const y = n.offsetY ?? n.locationY ?? 0;
      px.set(
        withSpring(Math.max(-1, Math.min(1, (x / box.current.w) * 2 - 1)), {
          damping: 20,
          stiffness: 90,
        }),
      );
      py.set(
        withSpring(Math.max(-1, Math.min(1, (y / box.current.h) * 2 - 1)), {
          damping: 20,
          stiffness: 90,
        }),
      );
    },
    [motionOK, px, py],
  );
  const onLeave = useCallback(() => {
    px.set(withSpring(0, { damping: 20, stiffness: 90 }));
    py.set(withSpring(0, { damping: 20, stiffness: 90 }));
  }, [px, py]);

  return (
    <View
      onLayout={onLayout}
      {...({ onPointerMove: onMove, onPointerLeave: onLeave } as object)}
      style={[{ height, width: '100%' }, style]}
    >
      <ScaledScene
        layout={layout}
        height={height}
        px={px}
        py={py}
        motionOK={motionOK}
        exchange={exchange}
      >
        {children}
      </ScaledScene>
    </View>
  );
}

/** Rendered once the box is measured so layers can be laid out in real px. */
function ScaledScene({
  layout,
  height,
  px,
  py,
  motionOK,
  exchange,
  children,
}: {
  layout: 'stack' | 'compact' | 'scatter';
  height: number;
  px: SharedValue<number>;
  py: SharedValue<number>;
  motionOK: boolean;
  exchange: boolean;
  children?: ReactNode;
}) {
  const colors = useThemeColors();
  const [w, setW] = useState(1);
  const box = { w, h: height };
  const specs = layout === 'scatter' ? scatterSpecs(w, height) : LAYOUTS[layout];

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {/* Background shapes — warm pebbles and a thin ring, far behind. */}
      <OrganicShape
        size={Math.min(w, height) * 0.82}
        color={colors.accentSoft}
        rotate={-12}
        style={{ left: w * 0.08, top: height * 0.06 }}
      />
      <OrganicShape
        size={Math.min(w, height) * 0.46}
        color={colors.surfaceMuted}
        rotate={24}
        drift={12}
        style={{ right: w * 0.02, bottom: height * 0.02 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: height * 0.7,
          height: height * 0.7,
          borderRadius: height,
          borderWidth: 1.5,
          borderColor: palette.orange200,
          opacity: 0.5,
          left: w / 2 - height * 0.35,
          top: height * 0.15,
        }}
      />
      {children}
      {w > 1
        ? specs.map((s, i) => (
            <Layer key={s.img} spec={s} box={box} index={i} px={px} py={py} motionOK={motionOK} />
          ))
        : null}
      {exchange && w > 1 && layout === 'stack' ? (
        <View style={{ position: 'absolute', left: w * 0.47, top: height * 0.34, zIndex: 5 }}>
          <ExchangeToken motionOK={motionOK} />
        </View>
      ) : null}
      {exchange && w > 1 && layout === 'compact' ? (
        <View style={{ position: 'absolute', left: w * 0.5 - 20, top: height * 0.58, zIndex: 5 }}>
          <ExchangeToken motionOK={motionOK} size={40} />
        </View>
      ) : null}
    </View>
  );
}
