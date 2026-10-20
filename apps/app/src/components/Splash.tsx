import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';

import { Button, Text } from '@pandam/ui';

import { brandAssets } from '@/components/intro/assets';
import { BRAND } from '@/components/intro/brand';
import { PaperBackground } from '@/components/intro/PaperBackground';
import { authKeys } from '@/lib/auth/hooks';

/** How long the splash may wait on the first auth check before offering a way out. */
const TIMEOUT_MS = 12_000;

/**
 * The loading screen: the standalone P on the cream paper — the same picture as the first
 * screen of the brand intro, so the hand-over between them is invisible. It is
 * mounted from several places while the session resolves.
 *
 * If the first `me` check has not resolved after TIMEOUT_MS, a quiet "couldn't
 * reach PANDAM" note with Retry appears under the P. Retry only re-runs the
 * existing session query; the auth logic itself is untouched.
 */
export function Splash() {
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [attempt]);

  const retry = () => {
    setTimedOut(false);
    setAttempt((a) => a + 1);
    void qc.refetchQueries({ queryKey: authKeys.me });
  };

  const pWidth = Math.min(width * 0.46, 300);
  const pHeight = pWidth * (BRAND.pSymbol.height / BRAND.pSymbol.width);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <StatusBar style="dark" />
      <PaperBackground />
      <Image
        source={brandAssets.pSymbol}
        resizeMode="contain"
        accessibilityLabel="PANDAM"
        style={{ width: pWidth, height: pHeight }}
      />
      {timedOut ? (
        <View
          style={{
            position: 'absolute',
            bottom: 72,
            alignItems: 'center',
            gap: 8,
            maxWidth: 300,
            paddingHorizontal: 16,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="cloud-offline-outline" size={16} color="#1A1A1A" />
            <Text variant="bodyStrong" style={{ color: '#1A1A1A' }}>
              Couldn’t reach PANDAM
            </Text>
          </View>
          <Text variant="bodySm" center style={{ color: '#5C5C5C' }}>
            Check your connection, then try again. Nothing has been lost.
          </Text>
          <Button
            label="Retry"
            onPress={retry}
            style={{ marginTop: 8, alignSelf: 'center' }}
            leftIcon={<Ionicons name="refresh" size={16} color="#FFFFFF" />}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Whether to keep the splash up. The brand intro is its own overlay (`IntroGate`),
 * so this is now just the real auth gate.
 */
export function useHoldSplash(waiting: boolean): boolean {
  return waiting;
}
