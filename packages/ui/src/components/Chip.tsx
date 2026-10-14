import { type ReactNode } from 'react';
import { View } from 'react-native';

import { colors, radii, spacing } from '../tokens';

import { Press } from './Press';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Which accent the selected state paints. */
  tone?: 'accent' | 'need' | 'match';
  icon?: ReactNode;
  /** Trailing count, e.g. how many listings a city has. */
  count?: number;
  accessibilityLabel?: string;
}

const TONE = {
  accent: { bg: colors.accent, soft: colors.accentSoft, text: colors.accentText },
  need: { bg: colors.need, soft: colors.needSoft, text: colors.needText },
  match: { bg: colors.match, soft: colors.matchSoft, text: colors.matchText },
} as const;

/**
 * Selectable filter pill (categories, cities, HAVE/NEED toggles).
 *
 * Selected chips fill solid: scanning a horizontal row, fill reads instantly
 * where a border-colour change does not. Unselected chips sit on the muted
 * surface rather than white, so the row reads as one control strip instead of
 * a line of little floating cards — and so the selected one is the only
 * bright thing in it.
 *
 * A `count` is rendered as a second, quieter piece of text rather than baked
 * into the label string, so the number never competes with the name.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'accent',
  icon,
  count,
  accessibilityLabel,
}: ChipProps) {
  const t = TONE[tone];
  const fg = selected ? colors.textInverse : colors.textSecondary;

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: selected ? t.bg : colors.border,
        backgroundColor: selected ? t.bg : colors.surfaceMuted,
        paddingLeft: icon ? spacing.md : spacing.lg,
        paddingRight: spacing.lg,
        height: 36,
      }}
    >
      {icon}
      <Text variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {/*
        The count sits in its own tinted capsule rather than as loose text.
        As plain text it read as part of the name — "Kochi 1" — which is the
        kind of small ambiguity that makes an interface feel unfinished.
      */}
      {count !== undefined ? (
        <View
          style={{
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            justifyContent: 'center',
            borderRadius: radii.pill,
            backgroundColor: selected ? 'rgba(255,255,255,0.22)' : colors.surface,
            borderWidth: selected ? 0 : 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text
            variant="caption"
            numeric
            style={{
              color: selected ? colors.textInverse : colors.textMuted,
              fontSize: 11,
              lineHeight: selected ? 18 : 16,
              includeFontPadding: false,
              textAlignVertical: 'center',
            }}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Press
      scale="sm"
      haptic="selection"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      style={{ borderRadius: radii.pill }}
      states={{
        hover: selected ? null : { backgroundColor: colors.surfaceHover },
        pressed: selected ? null : { backgroundColor: t.soft, borderColor: t.text },
      }}
    >
      {body}
    </Press>
  );
}
