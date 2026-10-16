import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { IconButton, Row, Text, spacing, useThemeColors } from '@pandam/ui';

export interface AppHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  /** Large title (screens you land on) vs compact (screens you drill into). */
  size?: 'lg' | 'md';
}

/**
 * In-screen page header (native headers are disabled app-wide).
 *
 * The back affordance sits on its OWN row above the title rather than beside
 * it. Two reasons, both practical: a long title no longer has to share the
 * line with a control, so it can run to the full width before truncating; and
 * the title always starts at the page gutter, so titles line up vertically as
 * you move between screens instead of shifting right whenever a back button
 * appears. It is the same reason iOS moved to large titles.
 *
 * The chevron is borderless and pulled left by its own padding so the GLYPH,
 * not the tap target, aligns with the gutter — the difference between a
 * header that looks typeset and one that looks assembled.
 */
export function AppHeader({
  title,
  eyebrow,
  subtitle,
  back = false,
  right,
  size = 'lg',
}: AppHeaderProps) {
  const colors = useThemeColors();

  const router = useRouter();

  return (
    <View style={{ paddingBottom: spacing.lg, gap: spacing.sm }}>
      {back ? (
        <Row justify="space-between" align="center" style={{ marginLeft: -spacing.md }}>
          <IconButton
            variant="plain"
            size={40}
            icon={<Ionicons name="chevron-back" size={22} color={colors.textPrimary} />}
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)'))}
          />
          {right}
        </Row>
      ) : null}

      <View style={{ gap: 2 }}>
        {eyebrow ? (
          <Text variant="overline" tone="accent" caps>
            {eyebrow}
          </Text>
        ) : null}
        <Row justify="space-between" gap="md" align="center">
          <Text variant={size === 'lg' ? 'display' : 'h2'} numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </Text>
          {/* A right action with no back button stays on the title line —
              a lone row above the title would read as an empty gap. */}
          {right && !back ? right : null}
        </Row>
        {subtitle ? (
          <Text variant="bodySm" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
