import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Text } from './Text';

type Kind = 'have' | 'need' | 'match' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  label: string;
  kind?: Kind;
  /**
   * `soft` is the default tint. `solid` is a filled chip, for the one badge on
   * a screen that must be read before anything else. `outline` is the
   * quietest — a hairline and coloured text, for a badge sitting inside an
   * already-busy row.
   */
  variant?: 'soft' | 'solid' | 'outline';
  icon?: ReactNode;
  /**
   * A leading colour dot instead of an icon. Cheaper than an icon at this
   * size and reads as a status light, which is usually what a badge means.
   */
  dot?: boolean;
}

/**
 * Badge colours.
 *
 * Every `fg` is a *text* token (the darkest step in its ramp), because a badge
 * is small text on a tint and the mid-ramp colours do not clear AA there. This
 * is the difference between a badge that looks designed and one that looks
 * washed out at arm's length.
 */
const makeSPEC = (
  colors: ThemeColors,
): Record<Kind, { soft: string; border: string; fg: string; solid: string }> => ({
  have: {
    soft: colors.accentSoft,
    border: colors.accentBorder,
    fg: colors.accentText,
    solid: colors.accent,
  },
  need: {
    soft: colors.needSoft,
    border: colors.needBorder,
    fg: colors.needText,
    solid: colors.need,
  },
  match: {
    soft: colors.matchSoft,
    border: colors.matchBorder,
    fg: colors.matchText,
    solid: colors.match,
  },
  neutral: {
    soft: colors.surfaceMuted,
    border: colors.border,
    fg: colors.textSecondary,
    solid: colors.textSecondary,
  },
  success: {
    soft: colors.successSoft,
    border: colors.accentBorder,
    fg: colors.successText,
    solid: colors.success,
  },
  warning: {
    soft: colors.warningSoft,
    border: colors.warningBorder,
    fg: colors.warningText,
    solid: colors.warning,
  },
  danger: {
    soft: colors.dangerSoft,
    border: colors.dangerBorder,
    fg: colors.dangerText,
    solid: colors.danger,
  },
  info: {
    soft: colors.infoSoft,
    border: colors.infoBorder,
    fg: colors.infoText,
    solid: colors.info,
  },
});

/**
 * Small pill for a status or a HAVE / NEED / MATCH marker.
 *
 * Sentence case, not caps. Caps at 10px needs heavy tracking to stay legible
 * and ends up shouting; the product already has one all-caps voice in the
 * `overline` section eyebrow, and two competing caps styles read as noise.
 */
export function Badge({ label, kind = 'neutral', variant = 'soft', icon, dot }: BadgeProps) {
  const colors = useThemeColors();

  const spec = makeSPEC(colors)[kind];
  const solid = variant === 'solid';
  const fg = solid ? colors.textInverse : spec.fg;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: dot ? spacing.xs : spacing.xxs,
        borderRadius: radii.pill,
        paddingHorizontal: dot || icon ? spacing.sm : 9,
        paddingVertical: 3,
        alignSelf: 'flex-start',
        backgroundColor: solid ? spec.solid : variant === 'outline' ? 'transparent' : spec.soft,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: spec.border,
      }}
    >
      {dot ? (
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: radii.pill,
            backgroundColor: solid ? colors.textInverse : spec.solid,
          }}
        />
      ) : (
        icon
      )}
      <Text variant="label" style={{ color: fg, fontSize: 11.5, lineHeight: 15 }}>
        {label}
      </Text>
    </View>
  );
}
