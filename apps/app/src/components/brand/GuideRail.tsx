import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useMotionOK } from '@pandam/ui';

import { M } from '@/components/matches/MatchesUI';

/**
 * The guided path above the create form: an outlined container with a numbered
 * stop per step. Purely a progress picture — the red fill springs forward as
 * sections are completed and the CURRENT stop is a filled red disc; it reads
 * the form's state and never drives it.
 */
export function GuideRail({ steps, done }: { steps: string[]; done: number }) {
  const motionOK = useMotionOK();
  const p = useSharedValue(0);
  const target = Math.min(1, done / Math.max(1, steps.length - 1));
  useEffect(() => {
    p.set(motionOK ? withSpring(target, { damping: 16, stiffness: 120 }) : target);
  }, [target, motionOK, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));

  return (
    <View
      style={{
        borderRadius: 6,
        borderWidth: 1.4,
        borderColor: M.ink,
        backgroundColor: M.bg,
        paddingHorizontal: 18,
        paddingTop: 22,
        paddingBottom: 14,
      }}
    >
      <View style={{ height: 24, justifyContent: 'center', marginHorizontal: 11 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: '#D9D7D1' }} />
        <Animated.View
          style={[
            { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: M.red },
            fill,
          ]}
        />
        <View
          style={{
            position: 'absolute',
            left: -11,
            right: -11,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {steps.map((s, i) => {
            const current = i === done;
            const reached = i < done;
            return (
              <View
                key={s}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: current || reached ? M.red : M.bg,
                  borderWidth: current || reached ? 0 : 1.8,
                  borderColor: M.ink,
                }}
              />
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        {steps.map((s, i) => (
          <Text
            key={s}
            numberOfLines={1}
            style={{
              width: `${100 / steps.length}%`,
              textAlign: i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center',
              fontFamily: i === done ? 'InterTight_700Bold' : 'InterTight_400Regular',
              fontSize: 13.5,
              color: i <= done ? M.red : '#555',
            }}
          >
            {s}
          </Text>
        ))}
      </View>
    </View>
  );
}
