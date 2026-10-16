import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { haptic, useMotionOK, useThemeColors } from '@pandam/ui';

/**
 * A save heart that pops with a spring when tapped.
 *
 * VISUAL ONLY: there is no favourites API, so the state lives in the card for
 * the session and is never sent anywhere. It exists to give browsing the
 * tactile "keep this" gesture people expect from a marketplace.
 */
export function SaveHeart({ size = 34 }: { size?: number }) {
  const colors = useThemeColors();

  const [saved, setSaved] = useState(false);
  const motionOK = useMotionOK();
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
      accessibilityState={{ selected: saved }}
      hitSlop={8}
      onPress={() => {
        haptic.selection();
        setSaved((s) => !s);
        if (motionOK) {
          pop.set(
            withSequence(
              withSpring(1.35, { damping: 6, stiffness: 400 }),
              withSpring(1, { damping: 10, stiffness: 220 }),
            ),
          );
        }
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,253,249,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#5A3A22',
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <Animated.View style={style}>
        <Ionicons
          name={saved ? 'heart' : 'heart-outline'}
          size={size * 0.5}
          color={saved ? colors.accent : colors.textPrimary}
        />
      </Animated.View>
    </Pressable>
  );
}
