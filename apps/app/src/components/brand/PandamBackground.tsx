import { type ReactNode, useCallback, useRef } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import {
  FloatingObject,
  Gradient,
  palette,
  useMotionOK,
  useResolvedScheme,
  useThemeColors,
} from '@pandam/ui';

import { brandImages, type BrandImageKey } from './imagery';
import { OrganicShape } from './OrganicShape';
import { PhotoObject } from './PhotoObject';

/* -------------------------------------------------------------------------- */
/* The background family                                                      */
/*                                                                            */
/*   PandamBackground     full-bleed ambient backdrop, one variant per screen */
/*   PandamOrganicShape   a soft pebble (alias of OrganicShape)               */
/*   PandamAmbientObject  a small, quiet floating product print               */
/*   PandamDepthLayer     content that parallaxes with the pointer by depth   */
/*                                                                            */
/* Rules: code-drawn only (no images behind text), low contrast, GPU-friendly */
/* transforms only, still under reduced motion, never interactive.            */
/* -------------------------------------------------------------------------- */

export const PandamOrganicShape = OrganicShape;

/** A small real object drifting in the far background — texture, not content. */
export function PandamAmbientObject({
  img,
  size = 64,
  rotate = 0,
  delay = 0,
  opacity = 0.9,
  style,
}: {
  img: BrandImageKey;
  size?: number;
  rotate?: number;
  delay?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FloatingObject
      delay={delay}
      amplitude={5}
      rotate={2}
      style={[{ position: 'absolute', opacity }, style]}
    >
      <View style={{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }}>
        <PhotoObject
          uri={brandImages[img]}
          seed={img}
          style={{ flex: 1 }}
          radius={size * 0.2}
          frame={3}
        />
      </View>
    </FloatingObject>
  );
}

/** Children shift with the pointer by `depth` (web). Static on touch / reduced motion. */
export function PandamDepthLayer({
  depth = 1,
  children,
  style,
}: {
  depth?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const motionOK = useMotionOK();
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  const size = useRef({ w: 1, h: 1 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 };
  }, []);
  const onMove = useCallback(
    (e: { nativeEvent: { offsetX?: number; offsetY?: number } }) => {
      if (!motionOK) return;
      const x = (e.nativeEvent.offsetX ?? 0) / size.current.w - 0.5;
      const y = (e.nativeEvent.offsetY ?? 0) / size.current.h - 0.5;
      px.set(withSpring(x, { damping: 22, stiffness: 80 }));
      py.set(withSpring(y, { damping: 22, stiffness: 80 }));
    },
    [motionOK, px, py],
  );
  const style2 = useAnimatedStyle(() => ({
    transform: [{ translateX: px.get() * 18 * depth }, { translateY: py.get() * 12 * depth }],
  }));
  return (
    <Animated.View
      onLayout={onLayout}
      {...({ onPointerMove: onMove } as object)}
      style={[style, style2]}
    >
      {children}
    </Animated.View>
  );
}

type Variant = 'home' | 'discover' | 'matches' | 'profile' | 'create' | 'quiet' | 'glow';

/**
 * A soft radial glow, faked natively with stacked translucent discs (React
 * Native has no radial gradient). Reads like a blurred colour field — the
 * "mesh gradient" look — with no SVG, no image asset and no blur cost.
 */
function Glow({ size, color, style }: { size: number; color: string; style: object }) {
  const rings = [1, 0.78, 0.58, 0.4];
  return (
    <View style={[{ position: 'absolute', width: size, height: size }, style]}>
      {rings.map((k) => (
        <View
          key={k}
          style={{
            position: 'absolute',
            width: size * k,
            height: size * k,
            left: (size - size * k) / 2,
            top: (size - size * k) / 2,
            borderRadius: (size * k) / 2,
            backgroundColor: color,
            opacity: 0.05,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Screen backdrops. Each variant places a few warm pebbles differently so
 * screens do not all share one wallpaper; `matches` gets the only sage tint
 * (the match colour), `quiet` is for dense list screens. Everything sits at the
 * page edges and top, away from where body text runs, and is decorative only.
 */
export function PandamBackground({ variant = 'quiet' }: { variant?: Variant }) {
  const colors = useThemeColors();
  const scheme = useResolvedScheme();

  const dark = scheme === 'dark';
  const T = dark ? colors.accentSoft : palette.orange50;
  const C = dark ? colors.surfaceMuted : palette.concreteSoft;
  const S = dark ? colors.accentSoft : palette.orange50;
  const shapes: Record<Variant, ReactNode> = {
    home: (
      <>
        <OrganicShape size={420} color={T} rotate={-16} style={{ top: -140, right: -160 }} />
        <OrganicShape
          size={260}
          color={C}
          rotate={24}
          drift={10}
          style={{ top: 520, left: -150 }}
        />
        <OrganicShape
          size={180}
          color={T}
          rotate={-40}
          drift={6}
          style={{ top: 980, right: -70 }}
        />
      </>
    ),
    discover: (
      <>
        <OrganicShape size={360} color={C} rotate={12} style={{ top: -150, left: -140 }} />
        <OrganicShape
          size={220}
          color={T}
          rotate={-28}
          drift={10}
          style={{ top: 260, right: -120 }}
        />
      </>
    ),
    matches: (
      <>
        <OrganicShape size={380} color={S} rotate={-10} style={{ top: -160, right: -150 }} />
        <OrganicShape
          size={240}
          color={T}
          rotate={30}
          drift={10}
          style={{ top: 420, left: -140 }}
        />
      </>
    ),
    profile: (
      <>
        <OrganicShape size={340} color={T} rotate={20} style={{ top: -120, left: -130 }} />
        <OrganicShape
          size={200}
          color={C}
          rotate={-12}
          drift={8}
          style={{ top: 360, right: -110 }}
        />
      </>
    ),
    create: (
      <>
        <OrganicShape size={300} color={T} rotate={-8} style={{ top: -110, right: -120 }} />
        <OrganicShape size={220} color={C} rotate={36} drift={8} style={{ top: 640, left: -130 }} />
      </>
    ),
    quiet: <OrganicShape size={300} color={T} rotate={-14} style={{ top: -140, right: -140 }} />,
    /*
     * `glow`: the premium default for content-dense screens. A warm wash that
     * fades into the page over the top ~third, plus two very low-contrast
     * colour fields (terracotta top-right, clay mid-left). Nothing opaque, so
     * it can never sit on top of, or slice, the cards and photos above it.
     */
    glow: (
      <>
        <Gradient
          colors={[scheme === 'dark' ? colors.backgroundSecondary : '#F1DFCC', colors.background]}
          direction="vertical"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }}
        />
        <Glow size={520} color={palette.orange400} style={{ top: -260, right: -200 }} />
        <Glow size={420} color={palette.steel} style={{ top: 300, left: -260 }} />
      </>
    ),
  };
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {shapes[variant]}
    </View>
  );
}
