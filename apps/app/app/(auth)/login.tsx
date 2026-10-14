import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { loginSchema, type LoginInput } from '@pandam/validation';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice, Press, Screen, Text, colors, haptic, useToast } from '@pandam/ui';

import { OAuthButtons, OAuthDivider } from '@/components/brand/OAuthButtons';
import { ApiError } from '@/lib/api/client';
import { useLogin } from '@/lib/auth/hooks';

/** The supplied hero photograph — used as-is; every crop below is layout only. */
const HERO_ASSET = require('../../assets/images/login-hero.webp') as number;
const HERO_W = 941;
const HERO_H = 1672;

/**
 * Shows one rectangle of the hero photograph, cover-fitted into a box. The
 * image file is never edited: it is scaled and offset inside a clipped frame.
 */
function Crop({
  region,
  width,
  height,
  style,
  label,
}: {
  region: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
  style?: object;
  label?: string;
}) {
  const k = Math.max(width / region.w, height / region.h);
  return (
    <View
      accessibilityLabel={label}
      accessible={!!label}
      style={[{ width, height, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, style]}
    >
      <Image
        source={HERO_ASSET}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: HERO_W * k,
          height: HERO_H * k,
          left: width / 2 - (region.x + region.w / 2) * k,
          top: height / 2 - (region.y + region.h / 2) * k,
        }}
      />
    </View>
  );
}

/** Swiss palette — deliberately tiny. */
const RED = '#FF3B2F';
const RED_PRESSED = '#E02F1F';
const INK = '#111111';
const MUTED = '#666666';
const BG = '#F8F7F3';
const RULE = '#D9D9D9';
/** Page margin on the 8pt spacing scale (8 / 16 / 24 / 32 / 48). */
const G = 16;
const display = { fontFamily: 'Inter_700Bold' } as const; // headline + numerals
const label = { fontFamily: 'Inter_600SemiBold' } as const; // caps labels, buttons

/**
 * The Swiss/editorial hero. Everything is positioned on a grid scaled from the
 * reference artwork (237pt wide), so the asymmetric composition keeps its
 * proportions on any phone width.
 */
function Hero({ width, height }: { width: number; height: number }) {
  // Horizontal scale follows the screen width; vertical scale is capped by the
  // height the screen can spare, so the hero compresses instead of forcing a
  // scroll on short phones. Images are cover-cropped, so nothing distorts.
  const sx = width / 237;
  const s = Math.min(sx, height / 307);
  /*
   * The collage is packed edge to edge: every tile edge is snapped to a whole
   * pixel and derived from its neighbour, so adjacent blocks share an edge
   * exactly — no seam, no gutter, at any screen width.
   */
  const ux = (n: number) => Math.round(n * sx);
  const u = (n: number) => Math.round(n * s);
  const chairW = ux(102);
  const chairH = u(195);
  const xChair = width - chairW; // chair's left edge = the hero's vertical guide
  const tileW = ux(56);
  const tile = u(56);
  const xMid = xChair + tileW; // headphones' right edge = red block's left edge
  const yEnd = chairH + tile * 2; // bottom of the collage
  return (
    <View style={{ width, height: yEnd, alignSelf: 'center' }}>
      {/* the chair: the top of the supplied photograph, cropped to the right column */}
      <Crop
        label="An orange armchair in a sunlit interior"
        region={{ x: 330, y: 0, w: 599, h: 1097 }}
        width={chairW}
        height={chairH}
        style={{ position: 'absolute', top: 0, left: xChair }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: xChair,
          height: yEnd,
          width: 1,
          backgroundColor: INK,
        }}
      />
      <Text
        style={{
          ...label,
          position: 'absolute',
          top: 8 * s,
          // left-aligned so every word starts on the same vertical line
          left: width - ux(38),
          textAlign: 'left',
          fontSize: 6.4 * s,
          lineHeight: 9 * s,
          letterSpacing: 0.6,
          color: '#FFFFFF',
        }}
      >
        {'BUY\nSELL\nSWAP\nGROW'}
      </Text>

      {/* headline */}
      <View style={{ position: 'absolute', top: 34 * s, left: G, width: 124 * sx }}>
        <Text
          style={{ ...display, fontSize: 21.2 * s, lineHeight: 21.2 * s, letterSpacing: -1.1 * s }}
        >
          Real things.
        </Text>
        <Text
          style={{
            ...display,
            fontSize: 21.2 * s,
            lineHeight: 21.2 * s,
            letterSpacing: -1.1 * s,
            color: RED,
          }}
        >
          {'New\npossibilities.'}
        </Text>
      </View>

      {/* supporting copy + editorial rule */}
      <Text
        style={{
          position: 'absolute',
          top: 154 * s,
          left: G,
          width: 76 * sx,
          fontFamily: 'Inter_400Regular',
          fontSize: 8.8 * s,
          lineHeight: 11.9 * s,
          color: INK,
        }}
      >
        {'A cleaner,\nsmarter way\nto buy, sell and\nswap everyday\nthings.'}
      </Text>
      <View
        style={{
          position: 'absolute',
          top: u(180),
          left: ux(89),
          // ends exactly at the bottom edge of the camera tile (`yEnd`)
          height: yEnd - u(180),
          width: 1,
          backgroundColor: RULE,
        }}
      />
      <View style={{ position: 'absolute', top: 205 * s, left: ux(95), gap: 3 * s }}>
        <Text style={{ ...display, fontSize: 11 * s, lineHeight: 12 * s, letterSpacing: -0.4 }}>
          01
        </Text>
        <Text
          style={{
            ...label,
            fontSize: 4.6 * s,
            lineHeight: 6 * s,
            letterSpacing: 0.5,
            color: INK,
          }}
        >
          {'PEOPLE\nTHINGS\nCOMMUNITY'}
        </Text>
      </View>

      {/* product collage — headphones | red arrow block, camera beneath */}
      <Crop
        region={{ x: 40, y: 1347, w: 340, h: 325 }}
        width={tileW}
        height={tile}
        style={{ position: 'absolute', top: chairH, left: xChair }}
      />
      <Crop
        region={{ x: 0, y: 1100, w: 450, h: 242 }}
        width={tileW + ux(38)}
        height={tile}
        style={{ position: 'absolute', top: chairH + tile, left: xMid - (tileW + ux(38)) }}
      />
      <View
        style={{
          position: 'absolute',
          top: chairH,
          left: xMid,
          width: width - xMid,
          height: tile * 2,
          backgroundColor: RED,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: u(10),
        }}
      >
        <Ionicons
          name="arrow-up-outline"
          size={15 * s}
          color="#fff"
          style={{ transform: [{ rotate: '45deg' }] }}
        />
      </View>
    </View>
  );
}

/** Underlined, icon-led field — the reference uses rules, not boxed inputs. */
function LineField({
  fieldHeight = 48,
  icon,
  trailing,
  error,
  ...input
}: React.ComponentProps<typeof TextInput> & {
  icon: keyof typeof Ionicons.glyphMap;
  trailing?: React.ReactNode;
  error?: string;
  fieldHeight?: number;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          height: fieldHeight,
          borderBottomWidth: 1,
          borderBottomColor: error ? colors.danger : RULE,
        }}
      >
        <Ionicons name={icon} size={20} color={INK} />
        <TextInput
          {...input}
          placeholderTextColor={MUTED}
          style={[
            {
              flex: 1,
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
              color: INK,
              paddingVertical: 0,
            },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={{ marginTop: 6 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const toast = useToast();
  const login = useLogin();
  const { width, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reveal, setReveal] = useState(false);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        haptic.success();
        router.replace('/(app)/(tabs)');
      },
      onError: () => haptic.error(),
    });
  });

  /*
   * The API returns one deliberately generic message for a bad email and a bad
   * password, so it cannot be used to discover which accounts exist. The copy
   * here has to work for both cases without implying which one it was.
   */
  const formError =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'We could not reach PANDAM. Check your connection and try again.'
        : null;

  const contentW = Math.min(width, 480);
  /*
   * Fit the whole screen in the viewport so it does not scroll on any phone:
   * the form takes a fixed block of height (tighter on short screens) and the
   * hero gets whatever is left. The page can still scroll if a keyboard or an
   * error message makes it taller.
   */
  const availH = winH - insets.top - insets.bottom;
  const naturalHero = Math.round((307 * contentW) / 237);
  const compact = availH - 440 < naturalHero;
  const formBlock = compact ? 364 : 440;
  const heroH = Math.min(naturalHero, Math.max(260, availH - formBlock));
  const fieldH = compact ? 44 : 48;
  const btnH = compact ? 48 : 56;
  const sectionGap = compact ? 16 : 24;
  const gutter = G;

  return (
    <Screen
      padded={false}
      background={BG}
      edges={['top', 'bottom']}
      contentStyle={{ maxWidth: '100%' }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentW }}>
            <Hero width={contentW} height={heroH} />

            <View
              style={{
                paddingHorizontal: gutter,
                paddingTop: sectionGap,
                paddingBottom: sectionGap,
                gap: sectionGap,
              }}
            >
              <OAuthButtons
                appearance="solid"
                height={btnH}
                onSuccess={() => router.replace('/(app)/(tabs)')}
              />
              <OAuthDivider ruleColor={RULE} />

              <View style={{ gap: 0 }}>
                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <LineField
                      fieldHeight={fieldH}
                      icon="mail-outline"
                      placeholder="Email address"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      returnKeyType="next"
                      accessibilityLabel="Email address"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <LineField
                      fieldHeight={fieldH}
                      icon="lock-closed-outline"
                      placeholder="Password"
                      secureTextEntry={!reveal}
                      autoCapitalize="none"
                      autoComplete="current-password"
                      textContentType="password"
                      returnKeyType="go"
                      accessibilityLabel="Password"
                      onSubmitEditing={onSubmit}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      trailing={
                        <Press
                          scale="lg"
                          haptic="selection"
                          accessibilityRole="button"
                          accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
                          hitSlop={10}
                          onPress={() => setReveal((v) => !v)}
                        >
                          <Ionicons
                            name={reveal ? 'eye-off-outline' : 'eye-outline'}
                            size={19}
                            color={INK}
                          />
                        </Press>
                      }
                    />
                  )}
                />
                <Press
                  scale="md"
                  haptic="light"
                  accessibilityRole="link"
                  hitSlop={8}
                  style={{ alignSelf: 'flex-end', paddingTop: 16 }}
                  onPress={() =>
                    toast.show({
                      message:
                        'Password reset is not available yet. Sign in with Google or contact support.',
                    })
                  }
                >
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: INK }}>
                    Forgot password?
                  </Text>
                </Press>
              </View>

              {formError ? (
                <Notice
                  kind="danger"
                  icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                >
                  {formError}
                </Notice>
              ) : null}

              <Press
                scale="sm"
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel="Sign in"
                disabled={login.isPending || formState.isSubmitting}
                onPress={onSubmit}
                states={{ pressed: { backgroundColor: RED_PRESSED } }}
                style={{
                  height: btnH,
                  borderRadius: 6,
                  backgroundColor: RED,
                  opacity: login.isPending ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{ ...label, flex: 1, textAlign: 'center', fontSize: 16, color: '#FFFFFF' }}
                >
                  {login.isPending ? 'Signing in…' : 'Sign in'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </Press>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: MUTED }}>
                  New to PANDAM?
                </Text>
                <Link href="/(auth)/register">
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: RED }}>
                    Create an account
                  </Text>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
