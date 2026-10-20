/**
 * Shows the two-screen brand intro once — the first time the app is opened — and
 * then never again (it is remembered on the device). The app underneath keeps
 * loading and signing in while the intro is up, so when it ends the right screen
 * is already there. Set EXPO_PUBLIC_INTRO_ALWAYS=1 to see it on every launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BRAND } from './brand';
import { BrandIntro } from './BrandIntro';

const KEY = 'pandam.intro.v1';
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

  const finish = useCallback(() => {
    setState('done');
    void AsyncStorage.setItem(KEY, 'seen').catch(() => undefined);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {state !== 'done' ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: BRAND.paper,
          }}
        >
          {state === 'show' ? <BrandIntro onDone={finish} /> : null}
        </View>
      ) : null}
    </View>
  );
}
