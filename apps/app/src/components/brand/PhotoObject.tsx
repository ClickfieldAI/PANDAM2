import { Image } from 'expo-image';
import { useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { Gradient, coverFor, radii, useThemeColors } from '@pandam/ui';

export interface PhotoObjectProps {
  uri?: string | null;
  /** Seed for the fallback gradient. */
  seed: string;
  radius?: number;
  /** White photo-print border, the thing that makes a photo read as an object. */
  frame?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A real photograph treated as a physical object: a print with a cream border,
 * rounded corners and a warm layered shadow (two shadows — a tight contact
 * shadow and a wide ambient one — which is what sells "sitting in space").
 * Lazy, cached and faded in via expo-image; a warm gradient underneath means a
 * slow or failed load never shows a grey box.
 */
export function PhotoObject({ uri, seed, radius = radii.xl, frame = 5, style }: PhotoObjectProps) {
  const colors = useThemeColors();

  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[
        {
          borderRadius: radius + frame,
          backgroundColor: colors.surface,
          padding: frame,
          // ambient
          shadowColor: '#5A3A22',
          shadowOpacity: 0.2,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 18 },
          elevation: 12,
        },
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          borderRadius: radius,
          overflow: 'hidden',
          // contact
          shadowColor: '#5A3A22',
          shadowOpacity: 0.12,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Gradient colors={coverFor(seed)} style={{ position: 'absolute', inset: 0 }} />
        {uri && !failed ? (
          <Image
            source={{ uri }}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            transition={260}
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
    </View>
  );
}
