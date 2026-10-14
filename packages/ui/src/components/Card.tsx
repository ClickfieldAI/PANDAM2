import { type ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, shadows, spacing } from '../tokens';

import { Press } from './Press';

type Elevation = 'none' | 'xs' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Shadow depth. `true` is kept as an alias for `xs`. */
  elevated?: boolean | Elevation;
  padded?: boolean;
  /** Hairline border. On by default — it is what makes a card a card here. */
  bordered?: boolean;
  /** Tinted surface for the accent / need / match contexts. */
  tone?: 'surface' | 'accent' | 'need' | 'match' | 'muted';
  radius?: keyof typeof radii;
  /**
   * A coloured rule down the leading edge. A cheap, quiet way to say which
   * side of a trade a card belongs to without tinting the whole surface.
   */
  edge?: 'accent' | 'need' | 'match' | 'danger' | 'warning';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const TONE_BG: Record<NonNullable<CardProps['tone']>, string> = {
  surface: colors.surface,
  accent: colors.accentSoft,
  need: colors.needSoft,
  match: colors.matchSoft,
  muted: colors.surfaceMuted,
};

const TONE_BORDER: Record<NonNullable<CardProps['tone']>, string> = {
  surface: colors.border,
  accent: colors.accentBorder,
  need: colors.needBorder,
  match: colors.matchBorder,
  muted: colors.border,
};

const EDGE_COLOR: Record<NonNullable<CardProps['edge']>, string> = {
  accent: colors.accent,
  need: colors.need,
  match: colors.match,
  danger: colors.danger,
  warning: colors.warning,
};

/**
 * A surface that groups related content.
 *
 * Definition is carried by the hairline border against the off-white page,
 * not by a shadow: the background and the surface are now a perceptible step
 * apart, so a card reads as raised without any blur at all. A shadow appears
 * only when a card genuinely floats — which for a tappable card means on
 * hover and press, where the lift is feedback rather than decoration.
 */
export function Card({
  children,
  onPress,
  elevated = false,
  padded = true,
  bordered = true,
  tone = 'surface',
  radius = 'lg',
  edge,
  accessibilityLabel,
  style,
}: CardProps) {
  // Plain surface cards rest on a faint warm shadow — on cream a border alone
  // reads flat; the soft shadow is what makes the redesign feel tactile.
  const depth: Elevation =
    elevated === true
      ? 'sm'
      : elevated === false
        ? tone === 'surface' && bordered
          ? 'xs'
          : 'none'
        : elevated;

  const base: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: TONE_BG[tone],
      borderRadius: radii[radius],
      borderWidth: bordered ? 1.5 : 0,
      borderColor: TONE_BORDER[tone],
    },
    padded && { padding: spacing.lg },
    edge && { borderLeftWidth: 4, borderLeftColor: EDGE_COLOR[edge] },
    shadows[depth],
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Press
      haptic="light"
      scale="sm"
      lift
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={base}
      states={{
        // Hover raises the border rather than the shadow: on a list of cards,
        // twelve shadows fading in and out is noise, one darkening edge is a
        // pointer telling you what you are about to open.
        hover: { borderColor: colors.borderStrong },
        pressed: { backgroundColor: tone === 'surface' ? colors.surfaceHover : undefined },
      }}
    >
      {children}
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
});
