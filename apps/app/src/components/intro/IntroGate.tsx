/**
 * Plays the two-screen brand intro by itself (P, transition, full logo, fade into the app) once — the first time the app is opened — and
 * then never again (it is remembered on the device). The app underneath keeps
 * loading and signing in while the intro is up, so when it ends the right screen
 * is already there. Set EXPO_PUBLIC_INTRO_ALWAYS=1 to see it on every launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';

import { BRAND } from './brand';
import { BrandIntro } from './BrandIntro';

const KEY = 'pandam.intro.v1';
/** The intro fades out over this long when it hands over to the app. */
const FADE_OUT_MS = 600;
const ALWAYS = process.env.EXPO_PUBLIC_INTRO_ALWAYS === '1';

type State = 'checking' | 'show' | 'done';

export function IntroGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let active = true;
    void (async () => {
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(KEY)) === 'seen';
      } catch {
        // Storage unavailable: treat as seen, so a broken disk never traps anyone behind the intro.
        seen = true;
      }
      if (active) setState(seen && !ALWAYS ? 'done' : 'show');
    })();
    return () => {
      active = false;
    };
  }, []);

  const opacity = useSharedValue(1);
  const leaving = useRef(false);

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    void AsyncStorage.setItem(KEY, 'seen').catch(() => undefined);
    opacity.set(
      withTiming(0, { duration: FADE_OUT_MS }, (done) => {
        if (done) runOnJS(setState)('done');
      }),
    );
  }, [opacity]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {state !== 'done' ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: BRAND.paper,
            opacity,
          }}
        >
          {state === 'show' ? <BrandIntro onDone={finish} /> : null}
        </Animated.View>
      ) : null}
    </View>
  );
}
