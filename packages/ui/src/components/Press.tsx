import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { type HapticKind, haptic } from '../haptics';
import { colors, shadows, timings } from '../tokens';

/** What the caller can paint differently per interaction state. */
export interface PressStateStyles {
  /** Pointer is over the element. Web only — touch devices never hover. */
  hover?: StyleProp<ViewStyle>;
  /** Finger or mouse is down. */
  pressed?: StyleProp<ViewStyle>;
  /** Element has keyboard focus. */
  focused?: StyleProp<ViewStyle>;
}

export interface PressProps extends Omit<PressableProps, 'style' | 'children'> {
  /**
   * Tactile depth: the surface rises (translate + warm shadow) on hover and
   * settles flat on press, like a physical card being pushed into the table.
   */
  lift?: boolean;
  children: ReactNode;
  /**
   * How far the element dips on press. Small by default: a deep dip reads as
   * a toy, and on web it forces a repaint of the text inside.
   */
  scale?: 'sm' | 'md' | 'lg' | 'none';
  /** Dim slightly on press, in addition to the scale. */
  dim?: boolean;
  /**
   * Skip the default focus ring — only for a control that draws its own
   * (a segmented control painting its selected pill, say).
   */
  noFocusRing?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Per-state overrides, so components describe their own feedback. */
  states?: PressStateStyles;
  /**
   * Tactile feedback on a confirmed tap (fires from `onPress`, so a drag that
   * turns into a scroll stays silent). `none` by default; opt in per control.
   */
  haptic?: HapticKind;
}

/**
 * Press dips. Tuned down from the original values: 0.98 is felt rather than
 * seen, which is the point — the feedback should register as the surface
 * responding, not as an animation playing.
 */
const NATIVE = Platform.OS !== 'web';
// Animated only on native: wrapping Pressable in an animated component breaks
// `onPress` on React Native Web (see notes below), so web keeps state styles.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SCALE = { sm: 0.96, md: 0.94, lg: 0.9, none: 1 } as const;

/**
 * The tappable wrapper behind every interactive surface in the product.
 *
 * It exists to make the four states a real control has — rest, hover, press,
 * focus — available everywhere from one place, rather than each component
 * inventing its own. Hover is web-only and focus is keyboard-only, so on a
 * phone this is just a press dip.
 *
 * Implementation notes, all learned the hard way:
 * - A plain `Pressable` carries both the touch handling and the caller's
 *   style, so layout (`flex`, width, margins) behaves exactly as written.
 * - `Animated.createAnimatedComponent(Pressable)` swallows `onPress` on React
 *   Native Web — every button silently stopped working. State-driven
 *   transforms are the portable way to do this.
 * - `style` is always a plain array, never a function: NativeWind's native jsx
 *   runtime drops function-form `style` props, which strips the visuals.
 * - The focus ring uses CSS `outline` (web) rather than a border, so it never
 *   participates in layout and cannot shift the element by a pixel.
 */
export function Press({
  children,
  scale = 'md',
  dim = true,
  noFocusRing = false,
  lift = false,
  style,
  states,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  disabled,
  haptic: hapticKind = 'none',
  onPress,
  ...rest
}: PressProps) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  // Native press dip is a spring on the UI thread, not a React re-render, so
  // it stays smooth while the JS thread is busy (lists, queries).
  const reduceMotion = useReducedMotion();
  const dip = useSharedValue(1);
  const dipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dip.value }],
  }));
  useEffect(() => {
    if (!NATIVE) return;
    const down = pressed && !disabled;
    const to = down ? SCALE[scale] : 1;
    dip.value = reduceMotion ? to : withSpring(to, { damping: 18, stiffness: 420, mass: 0.6 });
  }, [pressed, disabled, scale, reduceMotion, dip]);

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (e) => {
      if (hapticKind === 'light') haptic.light();
      else if (hapticKind === 'selection') haptic.selection();
      onPress?.(e);
    },
    [hapticKind, onPress],
  );

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      setPressed(true);
      onPressIn?.(e);
    },
    [onPressIn],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      setPressed(false);
      onPressOut?.(e);
    },
    [onPressOut],
  );

  const handleHoverIn = useCallback<NonNullable<PressableProps['onHoverIn']>>(
    (e) => {
      setHovered(true);
      onHoverIn?.(e);
    },
    [onHoverIn],
  );

  const handleHoverOut = useCallback<NonNullable<PressableProps['onHoverOut']>>(
    (e) => {
      setHovered(false);
      onHoverOut?.(e);
      // A pointer leaving mid-press must clear the press state too, otherwise
      // the element stays dipped after the mouse has gone.
      setPressed(false);
    },
    [onHoverOut],
  );

  const handleFocus = useCallback<NonNullable<PressableProps['onFocus']>>(
    (e) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback<NonNullable<PressableProps['onBlur']>>(
    (e) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const isPressed = pressed && !disabled;
  const isHovered = hovered && !disabled && !pressed;
  const isFocused = focused && !disabled;

  const Root = NATIVE ? AnimatedPressable : Pressable;

  return (
    <Root
      accessibilityRole="button"
      disabled={disabled}
      {...rest}
      onPress={onPress ? handlePress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[
        // A short transition makes hover feel like a material response rather
        // than a flicker. Web-only: `transitionDuration` is a no-op natively.
        Platform.OS === 'web'
          ? ({
              transitionDuration: `${timings.fast}ms`,
              transitionProperty: 'background-color, border-color, opacity, transform, box-shadow',
            } as unknown as ViewStyle)
          : null,
        style,
        lift && isHovered ? [{ transform: [{ translateY: -2 }] }, shadows.md] : null,
        isHovered && states?.hover,
        isPressed && [
          // Scale is web-only here; native gets the animated dip appended below.
          NATIVE ? null : { transform: [{ scale: SCALE[scale] }] },
          lift ? shadows.xs : null,
          dim ? { opacity: 0.94 } : null,
          states?.pressed,
        ],
        isFocused && [
          !noFocusRing && Platform.OS === 'web'
            ? ({
                outlineStyle: 'solid',
                outlineWidth: 2,
                outlineColor: colors.focus,
                outlineOffset: 2,
              } as unknown as ViewStyle)
            : null,
          states?.focused,
        ],
        NATIVE ? dipStyle : null,
      ]}
    >
      {children}
    </Root>
  );
}
