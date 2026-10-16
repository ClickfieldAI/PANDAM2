import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { layout, radii } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Press } from './Press';

export interface IconButtonProps {
  icon: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  /** `glass` is for icons sitting on a coloured hero header. */
  variant?: 'plain' | 'filled' | 'surface' | 'glass';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const makeSPEC = (
  colors: ThemeColors,
): Record<
  NonNullable<IconButtonProps['variant']>,
  { bg: string; hover: string; pressed: string; border?: string }
> => ({
  plain: {
    bg: 'transparent',
    hover: colors.surfaceMuted,
    pressed: colors.surfaceHover,
  },
  filled: {
    bg: colors.surfaceMuted,
    hover: colors.surfaceHover,
    pressed: colors.surfacePressed,
  },
  surface: {
    bg: colors.surface,
    hover: colors.surfaceHover,
    pressed: colors.surfaceMuted,
    border: colors.border,
  },
  /*
   * Sits on a photograph or a coloured hero, so it cannot rely on a tint for
   * legibility. A dark translucent fill works over both a bright sky and a
   * dark interior, where the old white-on-white 18% did not.
   */
  glass: {
    bg: 'rgba(18,22,25,0.34)',
    hover: 'rgba(18,22,25,0.48)',
    pressed: 'rgba(18,22,25,0.56)',
  },
});

/**
 * A round tap target wrapping any icon node.
 *
 * Always at least 44pt even when the glyph inside is 16pt — an icon-only
 * control has no label to widen its target, so it is the one place where the
 * minimum has to be enforced by the component rather than left to the layout.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = layout.touchTarget,
  disabled,
  style,
}: IconButtonProps) {
  const colors = useThemeColors();

  return (
    <Press
      scale="lg"
      haptic="light"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: makeSPEC(colors)[variant].bg,
          borderWidth: makeSPEC(colors)[variant].border ? 1 : 0,
          borderColor: makeSPEC(colors)[variant].border ?? 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
      states={{
        hover: { backgroundColor: makeSPEC(colors)[variant].hover },
        pressed: { backgroundColor: makeSPEC(colors)[variant].pressed },
      }}
    >
      {icon}
    </Press>
  );
}
