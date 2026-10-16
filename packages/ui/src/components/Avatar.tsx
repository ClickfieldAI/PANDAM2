import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { useThemeColors } from '../theme';
import { coverFor, radii } from '../tokens';

import { Gradient } from './Gradient';
import { Text } from './Text';

export interface AvatarProps {
  name: string;
  size?: number;
  /** Avatar image URL; falls back to initials when absent or unreachable. */
  uri?: string | null;
  /** White ring, for avatars sitting on a coloured or photographic surface. */
  ring?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Circular avatar: the uploaded photo when there is one, otherwise initials on
 * a gradient derived from the name — so a list of people is visually varied
 * rather than a column of identical grey discs.
 *
 * A photo that fails to load falls back to those initials rather than leaving
 * a hole, since an avatar is decoration and never worth an error state.
 */
export function Avatar({ name, size = 40, uri, ring = false }: AvatarProps) {
  const colors = useThemeColors();

  const [failed, setFailed] = useState(false);
  // A new URL (fresh upload, or a retry after a flaky network) deserves a fresh
  // attempt; without this one failed load pins the initials until remount.
  useEffect(() => setFailed(false), [uri]);
  const showPhoto = !!uri && !failed;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radii.pill,
          overflow: 'hidden',
        },
        ring && {
          borderWidth: 2,
          borderColor: colors.surface,
        },
      ]}
    >
      {showPhoto ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Gradient
          colors={coverFor(name)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              color: colors.textInverse,
              fontWeight: '800',
              fontSize: size * 0.38,
              // Explicit line box: without it the custom font's glyph is clipped
              // at the top (the "O" renders as a "U") on iOS.
              lineHeight: Math.round(size * 0.5),
              includeFontPadding: false,
              textAlign: 'center',
              letterSpacing: -0.3,
            }}
          >
            {initials(name)}
          </Text>
        </Gradient>
      )}
    </View>
  );
}
