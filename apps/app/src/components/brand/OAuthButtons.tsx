import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Button, Notice, Row, Stack, Text, useToast, useThemeColors } from '@pandam/ui';

import { ApiError } from '@/lib/api/client';
import { useOAuthLogin } from '@/lib/auth/hooks';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '@/lib/auth/oauth';

/** Google's official multicolour "G", bundled locally so it needs no network. */
const GOOGLE_G = require('../../../assets/images/google-g.png') as number;

/**
 * "Continue with Google" / "Continue with Apple" — the single shared control
 * both `login.tsx` and `register.tsx` render (a social sign-in does not
 * distinguish the two: the Worker creates the account on first use). Sits
 * above the divider, password fields stay below for anyone who prefers them.
 *
 * Apple's button only renders once `isAppleSignInAvailable()` resolves true
 * — real iOS hardware/simulator with a proper (non-Expo-Go) build. Google's
 * needs nothing native, so it always renders once a client id is configured;
 * lib/auth/oauth.ts throws a clear "not configured" error otherwise, shown
 * here as an inline notice rather than a silent failure.
 */
export function OAuthButtons({
  onSuccess,
  appearance = 'default',
  height = 56,
}: {
  onSuccess: () => void;
  /** `solid` is the editorial login: one full-width black Google button. */
  appearance?: 'default' | 'solid' | 'outline';
  /** Height of the solid Google button. */
  height?: number;
}) {
  const colors = useThemeColors();

  const toast = useToast();
  const oauthLogin = useOAuthLogin();
  const [appleReady, setAppleReady] = useState(false);
  const [pending, setPending] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((ok) => {
      if (active) setAppleReady(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const solid = appearance === 'solid';
  const outline = appearance === 'outline';

  const run = async (provider: 'google' | 'apple') => {
    setError(null);
    setPending(provider);
    try {
      const result = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (!result) return; // cancelled — not an error, say nothing
      await oauthLogin.mutateAsync({
        provider,
        idToken: result.idToken,
        nonce: result.nonce,
        displayName: result.displayName,
      });
      toast.success('Signed in.');
      onSuccess();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not complete sign-in. Please try again.',
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Stack gap="sm">
      <Row gap="sm">
        <View style={{ flex: 1 }}>
          <Button
            label={solid || outline ? 'Continue with Google' : 'Google'}
            variant={solid ? 'need' : 'secondary'}
            style={
              solid
                ? { height, backgroundColor: colors.need, borderColor: colors.border }
                : outline
                  ? { height, backgroundColor: colors.surface, borderColor: colors.border }
                  : undefined
            }
            size="lg"
            fullWidth
            loading={pending === 'google'}
            disabled={pending !== null}
            onPress={() => void run('google')}
            leftIcon={
              outline ? (
                // Google's own multicolour "G" (brand guidelines forbid recolouring it).
                <Image
                  source={GOOGLE_G}
                  accessibilityIgnoresInvertColors
                  style={{ width: 18, height: 18 }}
                />
              ) : (
                <Ionicons
                  name="logo-google"
                  size={17}
                  color={solid ? colors.textInverse : colors.textPrimary}
                />
              )
            }
          />
        </View>
        {appleReady && !solid && !outline ? (
          <View style={{ flex: 1 }}>
            <Button
              label="Apple"
              variant={Platform.OS === 'ios' ? 'primary' : 'secondary'}
              size="lg"
              fullWidth
              loading={pending === 'apple'}
              disabled={pending !== null}
              onPress={() => void run('apple')}
              leftIcon={
                <Ionicons
                  name="logo-apple"
                  size={18}
                  color={Platform.OS === 'ios' ? colors.textInverse : colors.textPrimary}
                />
              }
            />
          </View>
        ) : null}
      </Row>
      {appleReady && (solid || outline) ? (
        <Button
          label="Continue with Apple"
          variant="secondary"
          size="lg"
          fullWidth
          loading={pending === 'apple'}
          disabled={pending !== null}
          onPress={() => void run('apple')}
          leftIcon={<Ionicons name="logo-apple" size={18} color={colors.textPrimary} />}
        />
      ) : null}
      {error ? (
        <Notice
          kind="danger"
          icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
        >
          {error}
        </Notice>
      ) : null}
    </Stack>
  );
}

/** "or" divider between social sign-in and the email/password form. */
export function OAuthDivider({ ruleColor }: { ruleColor?: string }) {
  const colors = useThemeColors();
  const rule = ruleColor ?? colors.border;

  return (
    <Row gap="sm" align="center">
      <View style={{ flex: 1, height: 1, backgroundColor: rule }} />
      <Text variant="caption" tone="muted">
        or
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: rule }} />
    </Row>
  );
}
