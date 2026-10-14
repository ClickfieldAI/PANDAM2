import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { colors, radii, shadows, spacing, timings } from '../tokens';

import { Press } from './Press';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Accent painted behind the thumb when this segment is active. */
  tone?: 'accent' | 'need' | 'match';
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

const TONE_BG = {
  accent: colors.accent,
  need: colors.need,
  match: colors.match,
} as const;

/**
 * Two-or-three way switch with a sliding thumb.
 *
 * Used for HAVE / NEED, the single most important state in the product. The
 * thumb slides and takes the tone of the segment it lands on, so the switch
 * itself teaches the terracotta/clay language rather than just reporting a
 * value. It is the one piece of motion on most screens, which is why it is
 * allowed to be the expressive one.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [width, setWidth] = useState(0);
  const offset = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.timing(offset, {
      toValue: index,
      duration: timings.base,
      useNativeDriver: true,
    }).start();
  }, [index, offset]);

  const segmentWidth = width > 0 ? (width - 8) / options.length : 0;
  const activeLabel = options[index]?.label;
  const activeTone = options[index]?.tone ?? 'accent';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={activeLabel ? `${activeLabel} selected` : undefined}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceMuted,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
        position: 'relative',
      }}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 3,
              bottom: 3,
              left: 3,
              width: segmentWidth,
              borderRadius: radii.pill,
              backgroundColor: TONE_BG[activeTone],
              transform: [
                {
                  translateX: offset.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * segmentWidth),
                  }),
                },
              ],
            },
            shadows.xs,
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Press
            key={option.value}
            scale="none"
            haptic={selected ? 'none' : 'selection'}
            dim={false}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: spacing.sm,
              borderRadius: radii.pill,
            }}
          >
            <Text
              variant="label"
              numberOfLines={1}
              style={{
                color: selected ? colors.textInverse : colors.textSecondary,
                // The active label carries a touch more weight than the
                // inactive ones, so the state survives even where the thumb
                // colour is hard to judge.
                fontWeight: selected ? '600' : '500',
              }}
            >
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}
