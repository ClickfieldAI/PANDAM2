import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';

import { Text } from './Text';

export interface MetaProps {
  /** Each child becomes one segment, separated automatically. */
  children: ReactNode;
  /** Wrap onto a second line when the row runs out of width. */
  wrap?: boolean;
}

/**
 * A dot-separated row of metadata — category · type · time · place.
 *
 * Every card in the product was building this by hand, which meant the dots
 * were inconsistently styled and, worse, the separators were real text that a
 * screen reader would read aloud as "bullet". Here the dots are `Views`, so
 * assistive technology hears only the facts.
 *
 * Falsy children are dropped, which is what makes it safe to write
 * `{city && <Text>…}` inline without ending up with a dangling separator.
 */
export function Meta({ children, wrap = false }: MetaProps) {
  const colors = useThemeColors();

  const items = Children.toArray(children).filter(Boolean);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        rowGap: spacing.xs,
      }}
    >
      {items.map((child, i) => (
        // The index IS the identity here: segments are positional and have no
        // other stable key.
        <View key={`seg-${i}`} style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
          {i > 0 ? (
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: radii.pill,
                backgroundColor: colors.textFaint,
                marginHorizontal: spacing.sm,
              }}
            />
          ) : null}
          {child}
        </View>
      ))}
    </View>
  );
}

export interface MetaItemProps {
  icon?: ReactNode;
  label: string;
  tone?: 'muted' | 'secondary';
}

/** One segment of a `<Meta>` row: an optional icon plus a short label. */
export function MetaItem({ icon, label, tone = 'muted' }: MetaItemProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 }}>
      {icon}
      <Text variant="caption" tone={tone} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
