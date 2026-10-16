import { type ReactNode } from 'react';
import { View } from 'react-native';

import { FloatingObject } from '../motion/FloatingObject';
import { useThemeColors } from '../theme';
import { layout, radii, shadows, spacing } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  body?: string;
  icon?: ReactNode;
  /** A full illustration (e.g. a product still life). Replaces the framed icon. */
  art?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: 'primary' | 'need' | 'match' | 'secondary';
  /** Colour of the frame behind the icon. */
  tone?: 'accent' | 'need' | 'match' | 'neutral';
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** `inline` is the compact form for an empty section inside a full page. */
  size?: 'page' | 'inline';
}

const makeFRAME = (
  colors: ThemeColors,
): Record<NonNullable<EmptyStateProps['tone']>, { bg: string; border: string }> => ({
  accent: { bg: colors.accentSoft, border: colors.accentBorder },
  need: { bg: colors.needSoft, border: colors.needBorder },
  match: { bg: colors.matchSoft, border: colors.matchBorder },
  neutral: { bg: colors.surfaceMuted, border: colors.border },
});

/**
 * The placeholder shown when a list has nothing in it.
 *
 * Framed as a rounded square rather than the usual big pastel circle: a
 * squared frame echoes the item covers and category tiles elsewhere in the
 * product, so an empty list looks like the same piece of software as a full
 * one. It is also smaller than it wants to be — an empty state is a signpost,
 * not a billboard, and the action underneath is the actual point.
 */
export function EmptyState({
  title,
  body,
  icon,
  art,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  tone = 'neutral',
  secondaryLabel,
  onSecondary,
  size = 'page',
}: EmptyStateProps) {
  const colors = useThemeColors();

  const frame = makeFRAME(colors)[tone];
  const inline = size === 'inline';

  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: inline ? spacing['2xl'] : spacing['4xl'],
        paddingHorizontal: spacing.lg,
      }}
    >
      {art ? (
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>{art}</View>
      ) : icon ? (
        <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
          {/* The object floats gently above a soft ground shadow — an empty
              state that feels calm and alive rather than broken. Still under
              reduced motion. */}
          <FloatingObject amplitude={inline ? 3 : 6} rotate={inline ? 2 : 4}>
            <View
              style={{
                width: inline ? 52 : 72,
                height: inline ? 52 : 72,
                borderRadius: inline ? radii.lg : radii.xl,
                backgroundColor: frame.bg,
                borderWidth: 1,
                borderColor: frame.border,
                alignItems: 'center',
                justifyContent: 'center',
                ...shadows.md,
              }}
            >
              {icon}
            </View>
          </FloatingObject>
          <View
            style={{
              marginTop: spacing.sm,
              width: inline ? 34 : 46,
              height: 6,
              borderRadius: radii.pill,
              backgroundColor: 'rgba(5,5,5,0.08)',
            }}
          />
        </View>
      ) : null}

      <Text variant={inline ? 'h3' : 'display'} center>
        {title}
      </Text>

      {body ? (
        <Text
          variant={inline ? 'bodySm' : 'body'}
          tone="secondary"
          center
          style={{ maxWidth: layout.proseMaxWidth * 0.62 }}
        >
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, alignItems: 'center', gap: spacing.xs }}>
          <Button
            label={actionLabel}
            onPress={onAction}
            variant={actionVariant}
            size={inline ? 'sm' : 'md'}
          />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} onPress={onSecondary} variant="quiet" size="sm" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
