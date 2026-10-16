import { type ReactNode } from 'react';
import { ActivityIndicator, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, shadows, spacing, type typography } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Press, type PressProps } from './Press';
import { Text } from './Text';

/**
 * Button roles. Each exists for one reason, and a screen should be readable
 * as a hierarchy: at most one `primary`, everything else stepping down.
 *
 *   primary    the single most likely next action on the screen
 *   need       the equivalent primary on an "I NEED" surface
 *   match      the primary on a reciprocal-match surface
 *   secondary  a real alternative, equal in weight but not the default
 *   tertiary   a low-commitment action that still needs a target (filled grey)
 *   ghost      an action that should recede until wanted — text plus a hairline
 *   quiet      text only, no chrome; for "Cancel" and inline links
 *   danger     destructive and irreversible
 */
type Variant =
  | 'primary'
  | 'need'
  | 'match'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'quiet'
  | 'danger'
  | 'inverse';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressProps, 'children' | 'style' | 'states'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /**
   * Kept for compatibility with call sites that asked for a flat button.
   * Every button is flat now — filled variants no longer carry a glow — so
   * this is a no-op, retained rather than churning 30 screens.
   */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface Spec {
  bg: string;
  /** Background when hovered (web) — a half-step, never a different colour. */
  bgHover: string;
  /** Background while pressed. Deeper than hover so the two are distinct. */
  bgActive: string;
  fg: string;
  border?: string;
  borderHover?: string;
  /** Only the match variant lifts; a flat product needs a flat button. */
  elevated?: boolean;
}

/**
 * Solid fills, not gradients. Neo-brutalist: every button carries a 1.5px
 * black structural border, even filled ones — the border is what makes the
 * shape read as a deliberate object, not a soft default control. `match`
 * keeps a (now very restrained) lift as the one surface allowed spectacle.
 */
const makeSPEC = (colors: ThemeColors): Record<Variant, Spec> => ({
  primary: {
    bg: colors.accent,
    bgHover: colors.accentStrong,
    bgActive: colors.accentStrong,
    fg: colors.textInverse,
    border: colors.border,
  },
  need: {
    bg: colors.need,
    bgHover: colors.needStrong,
    bgActive: colors.needStrong,
    fg: colors.textInverse,
    border: colors.border,
  },
  match: {
    bg: colors.match,
    bgHover: colors.matchStrong,
    bgActive: colors.matchStrong,
    fg: colors.textInverse,
    border: colors.border,
    elevated: true,
  },
  secondary: {
    bg: colors.surface,
    bgHover: colors.surfaceHover,
    bgActive: colors.surfaceMuted,
    fg: colors.textPrimary,
    border: colors.border,
    borderHover: colors.borderStrong,
  },
  tertiary: {
    bg: colors.surfaceMuted,
    bgHover: colors.surfaceHover,
    bgActive: colors.surfacePressed,
    fg: colors.textPrimary,
    border: colors.border,
  },
  ghost: {
    bg: 'transparent',
    bgHover: colors.accentSoft,
    bgActive: colors.accentSoft,
    fg: colors.accentText,
    border: colors.accentBorder,
    borderHover: colors.accent,
  },
  quiet: {
    bg: 'transparent',
    bgHover: colors.surfaceMuted,
    bgActive: colors.surfaceHover,
    fg: colors.textSecondary,
  },
  danger: {
    bg: colors.danger,
    bgHover: colors.dangerStrong,
    bgActive: colors.dangerStrong,
    fg: colors.textInverse,
    border: colors.border,
  },
  inverse: {
    bg: colors.surface,
    bgHover: colors.accentSoft,
    bgActive: colors.accentSoft,
    fg: colors.accentText,
    border: colors.border,
  },
});

/**
 * Sizes.
 *
 * `md` (44) is exactly the minimum comfortable tap target, so it is the
 * default and needs no justification at a call site. `lg` (52) is for the one
 * committing action on a screen — the old 58 was tall enough to look like a
 * banner. `sm` (34) is for actions inside a row or card, where a full-size
 * button would out-weigh the content it belongs to.
 */
const PAD: Record<Size, { h: number; px: number; gap: number; font: keyof typeof typography }> = {
  sm: { h: 34, px: spacing.md, gap: spacing.xs, font: 'label' },
  md: { h: 44, px: spacing.lg, gap: spacing.sm, font: 'bodyStrong' },
  lg: { h: 52, px: spacing.xl, gap: spacing.sm, font: 'bodyStrong' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const colors = useThemeColors();

  const pad = PAD[size];
  const spec = makeSPEC(colors)[variant];
  const isDisabled = disabled || loading;

  return (
    <Press
      scale="sm"
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? 8 : 4}
      style={[
        styles.base,
        {
          height: pad.h,
          paddingHorizontal: pad.px,
          backgroundColor: spec.bg,
          borderRadius: radii.md,
          borderWidth: spec.border ? 1.5 : 0,
          borderColor: spec.border ?? 'transparent',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        // Structure comes from the border now, not a shadow — `match` keeps
        // a small lift as the one surface allowed to feel like it floats.
        spec.elevated && !isDisabled && size !== 'sm' ? shadows.xs : null,
        // Disabled reads as "not available now", so it keeps its shape and
        // loses contrast rather than disappearing.
        isDisabled && { opacity: 0.42 },
        style,
      ]}
      states={{
        hover: {
          backgroundColor: spec.bgHover,
          borderColor: spec.borderHover ?? spec.border ?? 'transparent',
        },
        pressed: {
          backgroundColor: spec.bgActive,
          borderColor: spec.borderHover ?? spec.border ?? 'transparent',
        },
      }}
      {...rest}
    >
      {/*
        The spinner replaces the label but the frame keeps its measured width,
        so a button does not jump narrower the moment it is tapped.
      */}
      {loading ? (
        <ActivityIndicator color={spec.fg} size="small" />
      ) : (
        <View style={[styles.row, { gap: pad.gap }]}>
          {leftIcon}
          <Text variant={pad.font} style={{ color: spec.fg }} numberOfLines={1}>
            {label}
          </Text>
          {rightIcon}
        </View>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
});
