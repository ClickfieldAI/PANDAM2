import { type StyleProp, View, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';

import { Text } from './Text';

export interface CountBadgeProps {
  value: number;
  /** Fill colour. */
  color?: string;
  /** Optional ring (e.g. the colour of the surface it sits on) to separate it from an icon. */
  ringColor?: string;
  /** Overall height in dp (width grows for 2+ digits). */
  size?: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A numeric badge whose digits are optically centred on every platform.
 *
 * Centring text in a small circle is fragile for one reason: the Text's line
 * box is usually taller than the circle (inherited line heights, Android font
 * padding), so flex centres the BOX, not the glyphs. Here the line height is
 * set to exactly the inner height, font padding is off, and the label is
 * centred both ways — no pixel nudges.
 */
export function CountBadge({
  value,
  color: colorProp,
  ringColor,
  size = 18,
  max = 9,
  style,
}: CountBadgeProps) {
  const colors = useThemeColors();
  const color = colorProp ?? colors.accent;

  const ring = ringColor ? 2 : 0;
  const inner = size - ring * 2;
  const label = value > max ? `${max}+` : String(value);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          minWidth: size,
          height: size,
          paddingHorizontal: label.length > 1 ? 4 : 0,
          borderRadius: size / 2,
          backgroundColor: color,
          borderWidth: ring,
          borderColor: ringColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        numeric
        style={{
          fontSize: Math.round(inner * 0.72),
          lineHeight: inner,
          height: inner,
          fontWeight: '800',
          color: colors.textInverse,
          textAlign: 'center',
          textAlignVertical: 'center',
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
