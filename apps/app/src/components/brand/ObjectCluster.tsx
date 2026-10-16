import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { FloatingObject, palette, shadows, useThemeColors } from '@pandam/ui';

import { brandImages, type BrandImageKey } from './imagery';
import { OrganicShape } from './OrganicShape';
import { PhotoObject } from './PhotoObject';

/**
 * A small still life for empty states: two real objects floating in depth
 * with a symbol between them, over a warm pebble. An empty screen should
 * still show the product's world, not a grey icon in a box.
 */
export function ObjectCluster({
  left = 'camera',
  right = 'sneakers',
  icon = 'swap-horizontal',
}: {
  left?: BrandImageKey;
  right?: BrandImageKey;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const colors = useThemeColors();

  return (
    <View style={{ width: 220, height: 150, alignItems: 'center', justifyContent: 'center' }}>
      <OrganicShape size={190} color={colors.accentSoft} rotate={-8} style={{ top: 0 }} />
      <FloatingObject
        delay={0}
        amplitude={6}
        rotate={3}
        style={{ position: 'absolute', left: 18, top: 22 }}
      >
        <View style={{ width: 88, height: 88, transform: [{ rotate: '-9deg' }] }}>
          <PhotoObject
            uri={brandImages[left]}
            seed={left}
            style={{ flex: 1 }}
            radius={16}
            frame={4}
          />
        </View>
      </FloatingObject>
      <FloatingObject
        delay={700}
        amplitude={6}
        rotate={3}
        style={{ position: 'absolute', right: 18, top: 30 }}
      >
        <View style={{ width: 80, height: 80, transform: [{ rotate: '8deg' }] }}>
          <PhotoObject
            uri={brandImages[right]}
            seed={right}
            style={{ flex: 1 }}
            radius={16}
            frame={4}
          />
        </View>
      </FloatingObject>
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.accent,
          borderWidth: 3,
          borderColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3,
          marginTop: 30,
          ...shadows.md,
        }}
      >
        <Ionicons name={icon} size={18} color={colors.textInverse} />
      </View>
    </View>
  );
}
