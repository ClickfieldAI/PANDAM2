import { type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { layout, radii, spacing } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Press } from './Press';
import { Text } from './Text';

export interface ListRowProps {
  /** Leading slot: an icon frame, an avatar, a cover thumbnail. */
  leading?: ReactNode;
  title: string;
  /** One line of supporting context under the title. */
  subtitle?: string;
  /** Third line, quieter still — a timestamp or status. */
  meta?: string;
  /** Trailing slot before the chevron: a badge, a count, a price. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Show the disclosure chevron. Pass the icon node so the app owns its icon set. */
  chevron?: ReactNode;
  /** Paint the title in the destructive tone (sign out, delete). */
  danger?: boolean;
  /** Unread / needs-attention marker on the leading edge. */
  emphasis?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * One row in a list of things you can open.
 *
 * This shape was being hand-built in six places — settings, messages, offers,
 * transactions, devices, notifications — and had drifted apart in every one:
 * different paddings, different title weights, chevrons on some and not
 * others. Pulling it into a primitive is what makes those screens feel like
 * they belong to the same product.
 *
 * The row is 64pt at its shortest, comfortably past the 44pt minimum target,
 * and the whole row is the target rather than just the title.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onPress,
  chevron,
  danger = false,
  emphasis = false,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const colors = useThemeColors();

  const body = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          minHeight: layout.touchTarget + 20,
        },
        style,
      ]}
    >
      {leading}

      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text
            variant={emphasis ? 'bodyStrong' : 'body'}
            tone={danger ? 'danger' : 'primary'}
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {title}
          </Text>
          {emphasis ? (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: radii.pill,
                backgroundColor: colors.accent,
              }}
            />
          ) : null}
        </View>

        {subtitle ? (
          <Text variant="bodySm" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      {trailing}
      {chevron}
    </View>
  );

  if (!onPress) return body;

  return (
    <Press
      haptic="light"
      scale="none"
      dim={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={{ borderRadius: radii.sm }}
      // A full-width row is too big to scale on press without looking like the
      // page wobbled, so the feedback is a background wash instead.
      states={{
        hover: { backgroundColor: colors.surfaceHover },
        pressed: { backgroundColor: colors.surfaceMuted },
      }}
    >
      {body}
    </Press>
  );
}

export interface IconFrameProps {
  children: ReactNode;
  /** Tint of the frame. */
  tone?: 'accent' | 'need' | 'match' | 'neutral' | 'danger' | 'warning' | 'info';
  size?: number;
}

const makeFRAME = (
  colors: ThemeColors,
): Record<NonNullable<IconFrameProps['tone']>, { bg: string; border: string }> => ({
  accent: { bg: colors.accentSoft, border: colors.accentBorder },
  need: { bg: colors.needSoft, border: colors.needBorder },
  match: { bg: colors.matchSoft, border: colors.matchBorder },
  neutral: { bg: colors.surfaceMuted, border: colors.border },
  danger: { bg: colors.dangerSoft, border: colors.dangerBorder },
  warning: { bg: colors.warningSoft, border: colors.warningBorder },
  info: { bg: colors.infoSoft, border: colors.infoBorder },
});

/**
 * The rounded-square tint behind a row's icon.
 *
 * Squared rather than circular, matching the item covers and the empty-state
 * frame — circles would make every list read as a contact list. A hairline
 * border keeps the tint from dissolving into a white surface.
 */
export function IconFrame({ children, tone = 'neutral', size = 38 }: IconFrameProps) {
  const colors = useThemeColors();

  const frame = makeFRAME(colors)[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size >= 44 ? radii.lg : radii.md,
        backgroundColor: frame.bg,
        borderWidth: 1,
        borderColor: frame.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}
