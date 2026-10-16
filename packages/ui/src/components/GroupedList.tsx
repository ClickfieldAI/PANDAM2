import { type ReactElement } from 'react';
import { FlatList, type FlatListProps, type ListRenderItem, View } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';

import { Divider } from './layout';

export interface GroupedListProps<T> extends Omit<
  FlatListProps<T>,
  'ItemSeparatorComponent' | 'renderItem'
> {
  renderItem: ListRenderItem<T>;
  /**
   * How far the separator is inset from the leading edge. Pass the width of
   * whatever sits in the row's leading slot plus its gap, so the rule starts
   * under the TEXT rather than under the avatar — the detail that makes a
   * list look typeset instead of ruled.
   */
  separatorInset?: number;
}

/**
 * A list rendered as one grouped surface: a single card with hairline rules
 * between rows.
 *
 * Four screens (offers, messages, transactions, notifications) were each
 * rendering a stack of separate cards with gaps. Eight floating cards read as
 * eight unrelated things; one grouped list reads as an inbox, which is what
 * all four of those screens actually are.
 *
 * The chrome lives on wrappers around the rows rather than on the rows
 * themselves, so the corner radii stay correct without any per-index
 * arithmetic — and so a row component knows nothing about its position.
 */
export function GroupedList<T>({
  renderItem,
  separatorInset = spacing.lg,
  data,
  ...rest
}: GroupedListProps<T>) {
  const colors = useThemeColors();

  const empty = !data || data.length === 0;

  /** The left and right edges every row shares. */
  const sides = {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  } as const;

  return (
    <FlatList
      data={data}
      renderItem={(info) => {
        const isFirst = info.index === 0;
        const isLast = info.index === (data?.length ?? 0) - 1;
        return (
          <View
            style={[
              sides,
              isFirst && {
                borderTopWidth: 1,
                borderTopLeftRadius: radii.lg,
                borderTopRightRadius: radii.lg,
              },
              isLast && {
                borderBottomWidth: 1,
                borderBottomLeftRadius: radii.lg,
                borderBottomRightRadius: radii.lg,
              },
              // `overflow: hidden` so a row's own press highlight is clipped
              // by the group's rounded corners instead of squaring them off.
              (isFirst || isLast) && { overflow: 'hidden' },
            ]}
          >
            {renderItem(info)}
          </View>
        );
      }}
      ItemSeparatorComponent={
        empty
          ? undefined
          : () => (
              <View style={sides}>
                <Divider tone="soft" inset={separatorInset} />
              </View>
            )
      }
      {...rest}
    />
  );
}

/**
 * The same grouping for a fixed set of rows that is not a `FlatList` — a
 * settings block, say, where the rows are written out rather than mapped.
 */
export function GroupedRows({
  children,
  separatorInset = spacing.lg,
}: {
  children: ReactElement[];
  separatorInset?: number;
}) {
  const colors = useThemeColors();

  const rows = children.filter(Boolean);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.lg,
        overflow: 'hidden',
      }}
    >
      {rows.map((child, i) => (
        <View key={child.key ?? `row-${i}`}>
          {i > 0 ? <Divider tone="soft" inset={separatorInset} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}
