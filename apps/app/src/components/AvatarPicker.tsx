import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';

import { Avatar, colors, palette } from '@pandam/ui';

// No `allowsEditing` here: the native crop step is known to silently fail to
// return a result in Expo Go (it needs a real dev/production build) — see
// apps/app/app/(app)/offer/new.tsx's pickPhoto for the same fix.
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
};

async function fromLibrary(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return res.canceled ? null : (res.assets[0]?.uri ?? null);
}

async function fromCamera(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Camera access needed', 'Allow camera access in Settings to take a profile photo.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    ...PICK_OPTIONS,
    cameraType: ImagePicker.CameraType.front,
  });
  return res.canceled ? null : (res.assets[0]?.uri ?? null);
}

/** The shared "take / choose a photo" flow, usable from any trigger (e.g. a text link). */
export async function choosePhoto(onPicked: (uri: string) => void, busy = false) {
  if (busy) return;
  if (Platform.OS === 'web') {
    const picked = await fromLibrary();
    if (picked) onPicked(picked);
    return;
  }
  Alert.alert('Profile photo', undefined, [
    {
      text: 'Take photo',
      onPress: () => void fromCamera().then((u) => u && onPicked(u)),
    },
    {
      text: 'Choose from library',
      onPress: () => void fromLibrary().then((u) => u && onPicked(u)),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/**
 * Tap-to-change profile photo. On a phone it offers Take photo / Choose from
 * library; on web it opens the file picker. Returns the local image URI via
 * `onPicked` — the caller decides when to upload (immediately on Profile,
 * after the account exists on sign-up).
 */
export function AvatarPicker({
  name,
  uri,
  size = 88,
  busy = false,
  variant = 'avatar',
  onPicked,
}: {
  name: string;
  /** Local preview or the current remote photo. */
  uri?: string | null;
  size?: number;
  busy?: boolean;
  /** `add` renders a square "+" trigger that opens the same picker. */
  variant?: 'avatar' | 'add';
  onPicked: (uri: string) => void;
}) {
  const choose = () => choosePhoto(onPicked, busy);

  if (variant === 'add') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={uri ? 'Change profile photo' : 'Add a profile photo'}
        onPress={() => void choose()}
        hitSlop={6}
        style={{
          width: size,
          height: size,
          borderWidth: 1,
          borderRadius: 8,
          borderColor: '#111111',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={Math.round(size * 0.5)} color="#111111" />
      </Pressable>
    );
  }

  const badge = Math.round(size * 0.34);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={uri ? 'Change profile photo' : 'Add a profile photo'}
      onPress={() => void choose()}
      hitSlop={6}
      style={{ width: size, height: size }}
    >
      <Avatar name={name || 'You'} size={size} uri={uri ?? undefined} />
      {busy ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: size / 2,
            backgroundColor: 'rgba(36,27,22,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={palette.white} />
        </View>
      ) : null}
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: badge,
          height: badge,
          borderRadius: badge / 2,
          backgroundColor: colors.accent,
          borderWidth: 3,
          borderColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="camera" size={Math.round(badge * 0.46)} color={palette.white} />
      </View>
    </Pressable>
  );
}
