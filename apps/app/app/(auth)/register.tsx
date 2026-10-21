import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, usernameSchema, z, type RegisterInput } from '@pandam/validation';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import { Image, Platform, TextInput, View, useWindowDimensions } from 'react-native';

import {
  KeyboardAvoid,
  KeyboardScrollView,
  Notice,
  Press,
  Screen,
  Text,
  haptic,
  useThemeColors,
  useToast,
} from '@pandam/ui';

import { AvatarPicker } from '@/components/AvatarPicker';
import { OAuthButtons, OAuthDivider } from '@/components/brand/OAuthButtons';
import { Wordmark } from '@/components/brand/Wordmark';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { ApiError } from '@/lib/api/client';
import { useRegister } from '@/lib/auth/hooks';
import { useUploadAvatar } from '@/lib/hooks/useMedia';

// Username is a plain optional string in the form (blank = none), validated
// against the shared rule only when present, then mapped to the strict input.
const registerFormSchema = registerSchema.extend({
  username: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || usernameSchema.safeParse(v).success, {
      message: 'letters, numbers and underscores only',
    }),
});
type RegisterFormValues = z.infer<typeof registerFormSchema>;

/** Swiss palette — deliberately tiny (same values as the login screen). */
const RED = '#FF3B2F';
const RED_PRESSED = '#E02F1F';
/** Page margin on the 8pt spacing scale (8 / 16 / 24 / 32 / 48). */
const G = 16;
const display = { fontFamily: 'Inter_700Bold' } as const;
const caps = { fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' } as const;

/** The supplied editorial collage (transparent background), used unmodified. */
const COLLAGE = require('../../assets/images/signup-collage.webp') as number;
const COLLAGE_W = 1206;
const COLLAGE_H = 1304;

type Region = { x: number; y: number; w: number; h: number };

/** One rectangle of the collage, cover-fitted into a box. The file is never edited. */
function Crop({ region, width, height }: { region: Region; width: number; height: number }) {
  const k = Math.max(width / region.w, height / region.h);
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Image
        source={COLLAGE}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: COLLAGE_W * k,
          height: COLLAGE_H * k,
          left: width / 2 - (region.x + region.w / 2) * k,
          top: height / 2 - (region.y + region.h / 2) * k,
        }}
      />
    </View>
  );
}

/** A slightly rotated paper print holding one crop of the collage. */
function Print({
  s,
  x,
  y,
  w,
  h,
  rot,
  region,
  label,
}: {
  s: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  region: Region;
  label: string;
}) {
  const colors = useThemeColors();

  const pad = Math.max(2, Math.round(3 * s));
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        left: x * s,
        top: y * s,
        width: w * s,
        height: h * s,
        padding: pad,
        backgroundColor: colors.surface,
        transform: [{ rotate: `${rot}deg` }],
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}
    >
      <Crop region={region} width={w * s - pad * 2} height={h * s - pad * 2} />
    </View>
  );
}

/**
 * Controlled-maximalist hero: headline on the left, layered paper prints of
 * the collage on the right, editorial metadata around them. Laid out on a
 * 390pt canvas and scaled, so the composition holds on any phone width.
 */
function Hero({ width }: { width: number }) {
  const colors = useThemeColors();
  const MUTED = colors.textMuted;
  const INK = colors.textPrimary;

  const s = width / 390;
  const big = 56 * s;
  const small = 40 * s;
  return (
    <View style={{ width, height: 346 * s, overflow: 'hidden' }}>
      {/* ---- the collage prints (behind the headline) ---- */}
      <Print
        s={s}
        x={203}
        y={34}
        w={116}
        h={130}
        rot={-3}
        region={{ x: 110, y: 40, w: 600, h: 620 }}
        label="Black over-ear headphones in front of a red circle"
      />
      <Print
        s={s}
        x={242}
        y={142}
        w={112}
        h={104}
        rot={3}
        region={{ x: 640, y: 440, w: 440, h: 400 }}
        label="A Sony mirrorless camera"
      />
      <Print
        s={s}
        x={168}
        y={236}
        w={100}
        h={70}
        rot={-2}
        region={{ x: 250, y: 640, w: 470, h: 340 }}
        label="White sneakers"
      />
      <Print
        s={s}
        x={228}
        y={290}
        w={98}
        h={54}
        rot={1.5}
        region={{ x: 480, y: 800, w: 650, h: 380 }}
        label="A silver laptop"
      />
      {/* handwritten note + BUY SELL SWAP sticker, cut from the same collage */}
      <View
        accessible
        accessibilityLabel="Same things. Different stories."
        style={{
          position: 'absolute',
          left: 318 * s,
          top: 58 * s,
          transform: [{ rotate: '7deg' }],
        }}
      >
        <Crop region={{ x: 40, y: 555, w: 295, h: 330 }} width={62 * s} height={70 * s} />
      </View>
      <View
        accessible
        accessibilityLabel="Buy, sell, swap"
        style={{
          position: 'absolute',
          left: 330 * s,
          top: 240 * s,
          transform: [{ rotate: '5deg' }],
        }}
      >
        <Crop region={{ x: 660, y: 115, w: 230, h: 270 }} width={42 * s} height={48 * s} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 322 * s,
          top: 296 * s,
          width: 66 * s,
          paddingVertical: 4 * s,
          paddingHorizontal: 5 * s,
          backgroundColor: RED,
          transform: [{ rotate: '-9deg' }],
        }}
      >
        <Text
          style={{
            ...caps,
            fontSize: 6.6 * s,
            lineHeight: 8.4 * s,
            letterSpacing: 0.4,
            color: '#FFFFFF',
          }}
        >
          {'SUSTAINABLE\nAFFORDABLE\nCOMMUNITY'}
        </Text>
      </View>

      {/* ---- top row: logo + editorial metadata ---- */}
      <View style={{ position: 'absolute', top: 14 * s, left: G }}>
        <Wordmark size="sm" />
      </View>
      <Text
        style={{
          ...caps,
          position: 'absolute',
          top: 14 * s,
          right: 12 * s,
          textAlign: 'right',
          fontSize: 7.5 * s,
          lineHeight: 10 * s,
          letterSpacing: 0.7,
          color: MUTED,
        }}
      >
        {'BUY\nSELL\nSWAP\nGROW'}
      </Text>

      {/* ---- headline ---- */}
      <View style={{ position: 'absolute', top: 52 * s, left: G }}>
        <Text
          style={{
            ...display,
            fontSize: big,
            lineHeight: big * 0.96,
            letterSpacing: -2,
            color: INK,
          }}
        >
          Good
        </Text>
        <Text
          style={{
            ...display,
            fontSize: big,
            lineHeight: big * 0.96,
            letterSpacing: -2,
            color: INK,
          }}
        >
          things
        </Text>
        <Text
          style={{
            ...display,
            fontSize: small,
            lineHeight: small * 1.02,
            letterSpacing: -1.2,
            color: RED,
          }}
        >
          find
        </Text>
        <Text
          style={{
            ...display,
            fontSize: small,
            lineHeight: small * 1.02,
            letterSpacing: -1.2,
            color: RED,
          }}
        >
          new homes.
        </Text>
      </View>
      {/* hand-drawn red underline */}
      <View
        style={{
          position: 'absolute',
          left: 20 * s,
          top: 236 * s,
          width: 170 * s,
          height: 3 * s,
          borderRadius: 2,
          backgroundColor: RED,
          transform: [{ rotate: '-1.2deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 56 * s,
          top: 242 * s,
          width: 100 * s,
          height: 2 * s,
          borderRadius: 2,
          backgroundColor: RED,
          transform: [{ rotate: '0.8deg' }],
        }}
      />

      {/* ---- supporting copy ---- */}
      <Text
        style={{
          position: 'absolute',
          left: G,
          top: 252 * s,
          width: 146 * s,
          fontFamily: 'Inter_400Regular',
          fontSize: 12.5 * s,
          lineHeight: 17 * s,
          color: INK,
        }}
      >
        {'Join a community that\nbuys, sells and swaps\neveryday things.'}
      </Text>

      {/* ---- editorial index ---- */}
      <View
        style={{
          position: 'absolute',
          left: G,
          top: 322 * s,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6 * s,
        }}
      >
        <View style={{ width: 6 * s, height: 6 * s, borderRadius: 4 * s, backgroundColor: RED }} />
        <View style={{ width: 14 * s, height: 1, backgroundColor: colors.need }} />
        <Text style={{ ...caps, fontSize: 7 * s, letterSpacing: 0.9, color: MUTED }}>People</Text>
        <Text style={{ ...caps, fontSize: 7 * s, letterSpacing: 0.9, color: MUTED }}>Things</Text>
        <Text style={{ ...caps, fontSize: 7 * s, letterSpacing: 0.9, color: INK }}>Community</Text>
      </View>
    </View>
  );
}

/** Filled input with the label inside the box: icon, label, then the value. */
function BoxField({
  label,
  optional,
  icon,
  hint,
  error,
  trailing,
  ...input
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  optional?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
  error?: string;
  trailing?: React.ReactNode;
}) {
  const colors = useThemeColors();
  const FIELD_BORDER = colors.borderSoft;
  const INK = colors.textPrimary;
  const MUTED = colors.textMuted;

  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 56,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: error ? colors.danger : focused ? RED : FIELD_BORDER,
          backgroundColor: colors.surfaceMuted,
        }}
      >
        <Ionicons name={icon} size={19} color={INK} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: INK }}>
              {label}
            </Text>
            {optional ? (
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: MUTED }}>
                Optional
              </Text>
            ) : null}
          </View>
          <TextInput
            {...input}
            accessibilityLabel={label}
            placeholderTextColor={MUTED}
            onFocus={(e) => {
              setFocused(true);
              input.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              input.onBlur?.(e);
            }}
            style={[
              {
                fontFamily: 'Inter_400Regular',
                fontSize: 15,
                color: INK,
                paddingVertical: 0,
                marginTop: 2,
              },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
        </View>
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11.5, color: MUTED }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export default function RegisterScreen() {
  const colors = useThemeColors();
  const BG = colors.background;
  const INK = colors.textPrimary;
  const MUTED = colors.textMuted;
  const RULE = colors.borderSoft;

  const router = useRouter();
  const register = useRegister();
  const uploadAvatar = useUploadAvatar();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [reveal, setReveal] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const { control, handleSubmit, formState, watch } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', password: '', displayName: '', username: '' },
  });

  const onSubmit = handleSubmit(
    (values) => {
      const payload: RegisterInput = {
        email: values.email,
        password: values.password,
        displayName: values.displayName,
        username: values.username?.trim() ? values.username.trim() : undefined,
      };
      register.mutate(payload, {
        onSuccess: async () => {
          // The photo can only be stored once the account exists. A failed
          // upload never blocks sign-up — it can be added later from Profile.
          if (photo) {
            try {
              await uploadAvatar.mutateAsync(photo);
            } catch {
              toast.error('Your photo could not be uploaded. You can add it from Profile.');
            }
          }
          haptic.success();
          router.replace('/(app)/(tabs)');
        },
        onError: (err) => {
          console.warn('[register] sign-up failed:', err instanceof Error ? err.message : err);
          toast.error(
            err instanceof ApiError
              ? err.message
              : 'We could not reach PANDAM. Check your connection and try again.',
          );
        },
      });
    },
    (errors) => {
      // A failed validation sends no request at all, so without this the tap
      // looks like it did nothing — say which fields need attention.
      const fields = Object.keys(errors).join(', ');
      console.warn('[register] form not submitted, invalid fields:', fields);
      toast.error(`Please check: ${fields}.`);
    },
  );

  const password = watch('password');
  const contentW = Math.min(width, 480);

  const formError =
    register.error instanceof ApiError
      ? register.error.message
      : register.error
        ? 'We could not reach PANDAM. Check your connection and try again.'
        : null;

  return (
    <Screen
      padded={false}
      background={BG}
      edges={['top', 'bottom']}
      contentStyle={{ maxWidth: '100%' }}
    >
      <KeyboardAvoid style={{ flex: 1 }}>
        <KeyboardScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center' }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentW }}>
            <Hero width={contentW} />

            {/* ------------------------------------------------ the form -- */}
            <View
              style={{
                marginHorizontal: 12,
                padding: G,
                gap: 16,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    ...display,
                    fontSize: 28,
                    lineHeight: 31,
                    letterSpacing: -0.9,
                    color: INK,
                  }}
                >
                  Create your account
                </Text>
                <Text
                  style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize: 14,
                    lineHeight: 20,
                    color: MUTED,
                  }}
                >
                  Join PANDAM and start trading what you have for what you need.
                </Text>
              </View>

              <OAuthButtons
                appearance="outline"
                onSuccess={() => router.replace('/(app)/(tabs)')}
              />
              <OAuthDivider ruleColor={RULE} />

              {/* profile photo: round avatar + a "+" box, both open the same picker */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <AvatarPicker
                  name={watch('displayName')}
                  uri={photo}
                  size={56}
                  onPicked={setPhoto}
                  busy={uploadAvatar.isPending}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: INK }}>
                    {photo ? 'Change your photo' : 'Add a profile photo'}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: MUTED }}>
                    (optional)
                  </Text>
                </View>
                <AvatarPicker
                  name={watch('displayName')}
                  uri={photo}
                  size={44}
                  variant="add"
                  onPicked={setPhoto}
                  busy={uploadAvatar.isPending}
                />
              </View>

              <Controller
                control={control}
                name="displayName"
                render={({ field, fieldState }) => (
                  <BoxField
                    label="Display name"
                    icon="person-outline"
                    placeholder="Maya Rao"
                    autoCapitalize="words"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="username"
                render={({ field, fieldState }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <BoxField
                        label="Username"
                        optional
                        icon="at"
                        placeholder="mayarao"
                        autoCapitalize="none"
                        value={field.value ?? ''}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    </View>
                    <View
                      style={{
                        width: 98,
                        minHeight: 56,
                        justifyContent: 'center',
                        paddingHorizontal: 8,
                        borderWidth: 1,
                        borderRadius: 8,
                        borderColor: colors.borderSoft,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'Inter_400Regular',
                          fontSize: 10.5,
                          lineHeight: 14,
                          color: MUTED,
                        }}
                      >
                        A handle others can find you by.
                      </Text>
                    </View>
                  </View>
                )}
              />
              <Controller
                control={control}
                name="email"
                render={({ field, fieldState }) => (
                  <BoxField
                    label="Email"
                    icon="mail-outline"
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
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
                  <View style={{ gap: 8 }}>
                    <BoxField
                      label="Password"
                      icon="lock-closed-outline"
                      placeholder="At least 10 characters"
                      hint={field.value ? undefined : 'At least 10 characters, with a number.'}
                      secureTextEntry={!reveal}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      textContentType="newPassword"
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
                            size={20}
                            color={INK}
                          />
                        </Press>
                      }
                    />
                    <PasswordRequirements value={password ?? ''} />
                  </View>
                )}
              />

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
                accessibilityLabel="Create account"
                disabled={register.isPending || uploadAvatar.isPending || formState.isSubmitting}
                onPress={onSubmit}
                states={{ pressed: { backgroundColor: RED_PRESSED } }}
                style={{
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: RED,
                  opacity: register.isPending || uploadAvatar.isPending ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: 'Inter_600SemiBold',
                    fontSize: 16,
                    color: '#FFFFFF',
                  }}
                >
                  {uploadAvatar.isPending
                    ? 'Uploading photo…'
                    : register.isPending
                      ? 'Creating…'
                      : 'Create account'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </Press>
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 24,
              }}
            >
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: MUTED }}>
                Already have an account?
              </Text>
              <Link href="/(auth)/login">
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: RED }}>
                  Sign in
                </Text>
              </Link>
            </View>
          </View>
        </KeyboardScrollView>
      </KeyboardAvoid>
    </Screen>
  );
}
