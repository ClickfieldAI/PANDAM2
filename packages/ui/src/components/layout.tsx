import { type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { spacing, type SpacingToken } from '../tokens';

type Gap = SpacingToken | number;
const g = (v: Gap | undefined) => (typeof v === 'number' ? v : v ? spacing[v] : undefined);

export interface StackProps {
  children: ReactNode;
  gap?: Gap;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}

/** Vertical flex container with a token gap. */
export function Stack({ children, gap = 'lg', align, justify, style }: StackProps) {
  return (
    <View style={[{ gap: g(gap), alignItems: align, justifyContent: justify }, style]}>
      {children}
    </View>
  );
}

/** Horizontal flex container with a token gap (wraps by default off). */
export function Row({ children, gap = 'sm', align = 'center', justify, style }: StackProps) {
  return (
    <View
      style={[
        { flexDirection: 'row', gap: g(gap), alignItems: align, justifyContent: justify },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface DividerProps {
  /**
   * `soft` for a rule inside an already-bordered container, where the full
   * border colour would read as a second edge.
   */
  tone?: 'default' | 'soft';
  /** Inset from the leading edge, to align a rule with text rather than the
   *  container — the detail that makes a settings list look typeset. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ tone = 'default', inset = 0, style }: DividerProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: tone === 'soft' ? colors.borderSoft : colors.border,
          alignSelf: 'stretch',
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}
