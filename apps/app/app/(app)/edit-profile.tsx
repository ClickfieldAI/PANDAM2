import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { boundedString, usernameSchema, z, type PatchProfileInput } from '@pandam/validation';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KeyboardAvoid,
  KeyboardScrollView,
  Notice,
  Press,
  type ThemeColors,
  useThemeColors,
  useToast,
} from '@pandam/ui';

import { AvatarPicker, choosePhoto } from '@/components/AvatarPicker';
import { useM } from '@/components/matches/MatchesUI';
import {
  AccentLines,
  AvatarRing,
  CornerDecor,
  FieldLabel,
  GUTTER,
  SectionTitle,
} from '@/components/profile/ProfileUI';
import { ApiError } from '@/lib/api/client';
import { mediaSrc } from '@/lib/api/media';
import { useSession } from '@/lib/auth/hooks';
import { useUpdateProfile } from '@/lib/auth/profile';
import { useUploadAvatar } from '@/lib/hooks/useMedia';

// Blank inputs are allowed and mean "clear this field"; non-empty values are
// checked against the shared rules, then mapped to the strict PatchProfileInput.
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional();
const profileFormSchema = z.object({
  displayName: boundedString(1, 80),
  username: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || usernameSchema.safeParse(v).success, {
      message: 'letters, numbers and underscores only',
    }),
  bio: optionalTrimmed(500),
  locationCity: optionalTrimmed(120),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** The bio counter follows the reference (0/160); typing stops there. */
const BIO_LIMIT = 160;

const fieldBoxStyle = (colors: ThemeColors) =>
  ({
    borderWidth: 1.2,
    borderColor: colors.borderSoft,
    borderRadius: 10,
    backgroundColor: colors.surface,
  }) as const;

function Input({ error, ...props }: TextInputProps & { error?: string }) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[
          fieldBoxStyle(colors),
          {
            height: 46,
            paddingHorizontal: 14,
            fontFamily: 'InterTight_400Regular',
            fontSize: 16,
            color: M.ink,
          },
        ]}
        {...props}
      />
      {error ? (
        <Text
          style={{
            fontFamily: 'InterTight_600SemiBold',
            fontSize: 12.5,
            color: colors.danger,
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export default function EditProfileScreen() {
  const M = useM();

  const colors = useThemeColors();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useSession();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const toast = useToast();
  const verified = user?.identityVerification?.status === 'verified';

  const { control, handleSubmit, reset, formState, watch } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: '', username: '', bio: '', locationCity: '' },
  });

  useEffect(() => {
    if (profile) {
      // keepDirtyValues: a background profile refresh (e.g. after a photo
      // upload) must not wipe what the user has typed but not yet saved.
      reset(
        {
          displayName: profile.displayName,
          username: profile.username ?? '',
          bio: profile.bio ?? '',
          locationCity: profile.locationCity ?? '',
        },
        { keepDirtyValues: true },
      );
    }
  }, [profile, reset]);

  const back = () => router.replace('/(app)/(tabs)/profile');

  const onSubmit = handleSubmit((values) => {
    const payload: PatchProfileInput = {
      displayName: values.displayName,
      username: values.username?.trim() ? values.username.trim() : null,
      bio: values.bio?.trim() ? values.bio.trim() : null,
      locationCity: values.locationCity?.trim() ? values.locationCity.trim() : null,
    };
    update.mutate(payload, {
      onSuccess: () => {
        toast.success('Profile updated.');
        back();
      },
    });
  });

  const formError =
    update.error instanceof ApiError
      ? update.error.message
      : update.error
        ? 'Update failed.'
        : null;

  const bioLength = (watch('bio') ?? '').length;
  const onPhoto = (uri: string) =>
    uploadAvatar.mutate(uri, {
      onSuccess: () => toast.success('Photo updated.'),
      onError: () => toast.error('That photo could not be uploaded. Please try again.'),
    });

  return (
    <KeyboardAvoid style={{ flex: 1, backgroundColor: M.bg }}>
      <KeyboardScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
      >
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <CornerDecor height={210} />

          <View style={{ paddingHorizontal: GUTTER }}>
            <Press
              haptic="light"
              scale="lg"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={back}
              hitSlop={12}
              style={{ width: 36, height: 36, justifyContent: 'center', marginLeft: -4 }}
            >
              <Ionicons name="arrow-back" size={26} color={M.ink} />
            </Press>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: 'InterTight_900Black',
                    fontSize: 46,
                    lineHeight: 50,
                    letterSpacing: -2.4,
                    color: M.ink,
                  }}
                >
                  Edit Profile
                </Text>
                <Text
                  style={{
                    fontFamily: 'InterTight_400Regular',
                    fontSize: 15,
                    color: colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  Tell others about yourself.
                </Text>
              </View>
            </View>
          </View>

          {/* Save sits top-right over the decoration, as in the reference. */}
          <Press
            haptic="light"
            scale="sm"
            accessibilityRole="button"
            accessibilityLabel="Save"
            disabled={update.isPending || formState.isSubmitting}
            onPress={onSubmit}
            states={{ pressed: { backgroundColor: M.redPressed } }}
            style={{
              position: 'absolute',
              top: 76,
              right: GUTTER,
              height: 46,
              paddingHorizontal: 28,
              borderRadius: 9,
              backgroundColor: M.red,
              borderWidth: 1.2,
              borderColor: '#3A1410',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: update.isPending ? 0.7 : 1,
            }}
          >
            <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 17, color: '#fff' }}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Text>
          </Press>

          {/* ------------------------------------------------------- photo -- */}
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <View>
              <AvatarRing size={100}>
                <AvatarPicker
                  name={profile?.displayName ?? 'You'}
                  size={100}
                  uri={mediaSrc(profile?.avatarUrl)}
                  busy={uploadAvatar.isPending}
                  onPicked={onPhoto}
                />
              </AvatarRing>
              <AccentLines size={44} style={{ right: -84, top: 4 }} />
            </View>
            <Press
              haptic="light"
              scale="md"
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              onPress={() => void choosePhoto(onPhoto, uploadAvatar.isPending)}
              hitSlop={8}
              style={{ marginTop: 8 }}
            >
              <Text style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 15, color: M.ink }}>
                {uploadAvatar.isPending
                  ? 'Uploading…'
                  : profile?.avatarUrl
                    ? 'Change photo'
                    : 'Add a photo'}
              </Text>
            </Press>
          </View>

          {/* ------------------------------------------------------ fields -- */}
          <View style={{ paddingHorizontal: GUTTER, marginTop: 18, gap: 14 }}>
            <Controller
              control={control}
              name="displayName"
              render={({ field, fieldState }) => (
                <View>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    autoCapitalize="words"
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    accessibilityLabel="Name"
                  />
                </View>
              )}
            />
            <Controller
              control={control}
              name="username"
              render={({ field, fieldState }) => (
                <View>
                  <FieldLabel>Username</FieldLabel>
                  <View
                    style={[
                      fieldBoxStyle(colors),
                      {
                        height: 46,
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 14,
                      },
                    ]}
                  >
                    <Text
                      style={{ fontFamily: 'InterTight_400Regular', fontSize: 16, color: M.ink }}
                    >
                      @
                    </Text>
                    <TextInput
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      autoCapitalize="none"
                      autoCorrect={false}
                      accessibilityLabel="Username"
                      placeholder="username"
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        fontFamily: 'InterTight_400Regular',
                        fontSize: 16,
                        color: M.ink,
                        padding: 0,
                      }}
                    />
                  </View>
                  {fieldState.error?.message ? (
                    <Text
                      style={{
                        fontFamily: 'InterTight_600SemiBold',
                        fontSize: 12.5,
                        color: colors.danger,
                        marginTop: 4,
                      }}
                    >
                      {fieldState.error.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="bio"
              render={({ field, fieldState }) => (
                <View>
                  <FieldLabel>Bio</FieldLabel>
                  <TextInput
                    value={field.value ?? ''}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    multiline
                    maxLength={BIO_LIMIT}
                    textAlignVertical="top"
                    accessibilityLabel="Bio"
                    placeholder="Tell others what you like to trade..."
                    placeholderTextColor={colors.textMuted}
                    style={[
                      fieldBoxStyle(colors),
                      {
                        height: 92,
                        paddingHorizontal: 14,
                        paddingTop: 12,
                        fontFamily: 'InterTight_400Regular',
                        fontSize: 16,
                        color: M.ink,
                      },
                    ]}
                  />
                  <Text
                    style={{
                      alignSelf: 'flex-end',
                      fontFamily: 'InterTight_400Regular',
                      fontSize: 13,
                      color: colors.textMuted,
                      marginTop: 4,
                    }}
                  >
                    {bioLength}/{BIO_LIMIT}
                  </Text>
                  {fieldState.error?.message ? (
                    <Text
                      style={{
                        fontFamily: 'InterTight_600SemiBold',
                        fontSize: 12.5,
                        color: colors.danger,
                      }}
                    >
                      {fieldState.error.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="locationCity"
              render={({ field, fieldState }) => (
                <View>
                  <FieldLabel>City</FieldLabel>
                  <View
                    style={[
                      fieldBoxStyle(colors),
                      {
                        height: 46,
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        gap: 10,
                      },
                    ]}
                  >
                    <Ionicons name="location-outline" size={21} color={M.ink} />
                    <TextInput
                      value={field.value ?? ''}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      autoCapitalize="words"
                      accessibilityLabel="City"
                      placeholder="Select city"
                      placeholderTextColor={colors.textMuted}
                      style={{
                        flex: 1,
                        fontFamily: 'InterTight_400Regular',
                        fontSize: 16,
                        color: M.ink,
                        padding: 0,
                      }}
                    />
                  </View>
                  {fieldState.error?.message ? (
                    <Text
                      style={{
                        fontFamily: 'InterTight_600SemiBold',
                        fontSize: 12.5,
                        color: colors.danger,
                        marginTop: 4,
                      }}
                    >
                      {fieldState.error.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          </View>

          {formError ? (
            <View style={{ paddingHorizontal: GUTTER, marginTop: 14 }}>
              <Notice
                kind="danger"
                icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
              >
                {formError}
              </Notice>
            </View>
          ) : null}

          {/* ------------------------------------------------ verification -- */}
          <View style={{ marginTop: 24 }}>
            <SectionTitle title="Verification" />
            <Press
              haptic="light"
              scale="sm"
              accessibilityRole="button"
              accessibilityLabel={verified ? 'Identity verified' : 'Verify your identity'}
              onPress={() =>
                router.push(verified ? '/(onboarding)/verify/complete' : '/(onboarding)/verify')
              }
              style={{
                marginHorizontal: GUTTER,
                marginTop: 10,
                borderRadius: 10,
                backgroundColor: verified ? colors.successSoft : M.track,
                paddingHorizontal: 14,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <Ionicons
                name={verified ? 'shield-checkmark' : 'shield-outline'}
                size={28}
                color={verified ? M.red : M.secondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 17, color: M.ink }}>
                  {verified ? 'Identity Verified' : 'Not verified yet'}
                </Text>
                <Text
                  style={{
                    fontFamily: 'InterTight_400Regular',
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginTop: 1,
                  }}
                >
                  {verified
                    ? 'Your identity has been verified'
                    : 'Verify your identity to build trust with other traders'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </Press>
          </View>
        </View>
      </KeyboardScrollView>
    </KeyboardAvoid>
  );
}
