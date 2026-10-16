import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Avatar, Reveal, layout, radii, spacing, useMotionOK, useThemeColors } from '@pandam/ui';

/** One dot in the "typing" row — fades and lifts a few px, offset from its
 *  neighbours so the three read as a stagger rather than a single pulse. */
function Dot({ delay }: { delay: number }) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const p = useSharedValue(0);

  useEffect(() => {
    if (!motionOK) {
      p.value = 0.6;
      return;
    }
    p.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 360 }), withTiming(0, { duration: 360 })),
        -1,
      ),
    );
    // Cancelling on unmount is handled by Reanimated itself when the shared
    // value goes away with the component.
  }, [motionOK, delay, p]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + p.value * 0.65,
    transform: [{ translateY: -3 * p.value }],
  }));

  return (
    <Animated.View
      style={[
        { width: 5, height: 5, borderRadius: radii.pill, backgroundColor: colors.textMuted },
        style,
      ]}
    />
  );
}

/**
 * "Someone is typing" — the other person's avatar beside a small bordered
 * off-white chip of three staggered dots. Deliberately tiny: a message-sized
 * footprint, not a card or a pill banner, so it reads as live conversation
 * activity rather than a notification.
 *
 * Mounted only while `visible` is true (see the chat screen's `ListFooterComponent`),
 * so it never reserves space when nobody is typing.
 */
export function TypingIndicator({ name, avatarUri }: { name: string; avatarUri?: string }) {
  const colors = useThemeColors();

  return (
    <Reveal offset={6} style={{ alignSelf: 'flex-start' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.xs,
          marginTop: spacing.sm,
        }}
      >
        <Avatar name={name} size={22} uri={avatarUri} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: colors.surface,
            borderWidth: layout.hairline,
            borderColor: colors.border,
            borderRadius: radii.lg,
            borderBottomLeftRadius: radii.xs,
            paddingHorizontal: spacing.md,
            paddingVertical: 10,
          }}
          accessibilityLabel={`${name} is typing`}
        >
          <Dot delay={0} />
          <Dot delay={140} />
          <Dot delay={280} />
        </View>
      </View>
    </Reveal>
  );
}
