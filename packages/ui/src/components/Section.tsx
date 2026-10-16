import { type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';

import { Press } from './Press';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Small caps line above the title. */
  eyebrow?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

/**
 * The title row above every content block, so the rhythm of eyebrow / title /
 * action is identical on every screen.
 *
 * The eyebrow is optional and should stay that way: one all-caps line per
 * screen is a nice signpost, five of them stacked down a page is wallpaper.
 * Where a section is self-evident, the title alone is the better call.
 */
export function SectionHeader({
  title,
  eyebrow,
  subtitle,
  actionLabel,
  onAction,
  icon,
}: SectionHeaderProps) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? (
          <Text variant="overline" tone="muted" caps>
            {eyebrow}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {icon}
          <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text variant="bodySm" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Press
          onPress={onAction}
          scale="sm"
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
          style={{
            paddingBottom: 2,
            paddingHorizontal: spacing.xs,
            marginRight: -spacing.xs,
            borderRadius: radii.sm,
          }}
          states={{ hover: { backgroundColor: colors.accentSoft } }}
        >
          <Text variant="label" tone="accent">
            {actionLabel}
          </Text>
        </Press>
      ) : null}
    </View>
  );
}

export interface SectionProps extends SectionHeaderProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Section header + body, with the standard gap between blocks. */
export function Section({ children, style, ...header }: SectionProps) {
  return (
    <View style={style}>
      <SectionHeader {...header} />
      {children}
    </View>
  );
}
