import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Notice, Sheet, Stack, Text, radii, spacing, useThemeColors } from '@pandam/ui';

import { formatCoordinates } from '@/lib/maps';

export interface PickedLocation {
  latitude: number;
  longitude: number;
  placeName?: string;
}

type Phase =
  | { kind: 'locating' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'off' }
  | { kind: 'error' }
  | { kind: 'ready'; place: PickedLocation };

/** "Cubbon Park, Bengaluru" from whatever the reverse geocoder knows; undefined when nothing useful. */
function nameFrom(a: Location.LocationGeocodedAddress | undefined): string | undefined {
  if (!a) return undefined;
  const first = a.name && a.name !== a.street ? a.name : (a.street ?? a.district ?? undefined);
  const parts = [first, a.city ?? a.subregion ?? a.region].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ').slice(0, 200) : undefined;
}

/** Give up waiting for a GPS fix after this long. */
const FIX_TIMEOUT_MS = 15_000;

/**
 * "Share location": asks for permission ONLY when this sheet opens (never when the chat opens),
 * finds where the person is, shows it for confirmation, and sends nothing until they press the
 * button. Denied permission, switched-off location services and a failed fix each get their own
 * plain explanation and a way forward.
 */
function LocationFinder({
  onClose,
  onConfirm,
  sending,
}: {
  onClose: () => void;
  onConfirm: (place: PickedLocation) => void;
  sending?: boolean;
}) {
  const colors = useThemeColors();
  const [phase, setPhase] = useState<Phase>({ kind: 'locating' });
  const run = useRef(0);

  const lookup = useCallback(async () => {
    const mine = ++run.current;
    const live = () => run.current === mine;
    try {
      // Asked here, on the person's own tap, and nowhere earlier.
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!live()) return;
      if (perm.status !== 'granted') {
        setPhase({ kind: 'denied', canAskAgain: perm.canAskAgain });
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        if (live()) setPhase({ kind: 'off' });
        return;
      }
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
      ]);
      if (!live()) return;
      if (!fix) {
        setPhase({ kind: 'error' });
        return;
      }
      const { latitude, longitude } = fix.coords;
      let placeName: string | undefined;
      try {
        placeName = nameFrom((await Location.reverseGeocodeAsync({ latitude, longitude }))[0]);
      } catch {
        // No place name available (offline geocoder, web): coordinates alone are still useful.
      }
      if (live()) setPhase({ kind: 'ready', place: { latitude, longitude, placeName } });
    } catch {
      if (live()) setPhase({ kind: 'error' });
    }
  }, []);

  // Starts when the sheet opens (this component mounts then); closing it cancels a lookup in flight.
  useEffect(() => {
    const t = setTimeout(() => void lookup(), 0);
    return () => {
      clearTimeout(t);
      run.current += 1;
    };
  }, [lookup]);

  const locate = () => {
    setPhase({ kind: 'locating' });
    void lookup();
  };

  const openSettings = () => {
    if (Platform.OS === 'web') return;
    void Linking.openSettings().catch(() => undefined);
  };

  return (
    <Stack gap="lg" style={{ paddingBottom: spacing.lg }}>
      {phase.kind === 'locating' ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], gap: spacing.md }}>
          <ActivityIndicator color={colors.accent} />
          <Text variant="body" tone="muted">
            Finding where you are…
          </Text>
        </View>
      ) : null}

      {phase.kind === 'ready' ? (
        <View
          style={{
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.borderSoft,
            backgroundColor: colors.surfaceMuted,
            padding: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="location" size={26} color={colors.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {phase.place.placeName ?? 'Your current location'}
            </Text>
            <Text variant="caption" tone="muted">
              {formatCoordinates(phase.place)}
            </Text>
          </View>
        </View>
      ) : null}

      {phase.kind === 'denied' ? (
        <Notice
          kind="warning"
          icon={<Ionicons name="location-outline" size={16} color={colors.warning} />}
        >
          Location access is off for PANDAM.{' '}
          {phase.canAskAgain
            ? 'Allow it to share where you are, or just send a message instead.'
            : 'Turn it on in your phone’s Settings to share where you are.'}
        </Notice>
      ) : null}
      {phase.kind === 'off' ? (
        <Notice
          kind="warning"
          icon={<Ionicons name="location-outline" size={16} color={colors.warning} />}
        >
          Location services are switched off on this device. Turn them on in Settings, then try
          again.
        </Notice>
      ) : null}
      {phase.kind === 'error' ? (
        <Notice
          kind="danger"
          icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
        >
          Could not find your location. Check your signal and that location is on, then try again.
        </Notice>
      ) : null}

      {phase.kind === 'ready' ? (
        <Button
          label="Send this location"
          variant="primary"
          size="lg"
          fullWidth
          loading={sending}
          onPress={() => onConfirm(phase.place)}
        />
      ) : null}
      {phase.kind === 'denied' && !phase.canAskAgain ? (
        <Button
          label="Open Settings"
          variant="primary"
          size="lg"
          fullWidth
          onPress={openSettings}
        />
      ) : null}
      {phase.kind === 'denied' && phase.canAskAgain ? (
        <Button label="Allow location" variant="primary" size="lg" fullWidth onPress={locate} />
      ) : null}
      {phase.kind === 'off' ? (
        <Button
          label="Open Settings"
          variant="primary"
          size="lg"
          fullWidth
          onPress={openSettings}
        />
      ) : null}
      {phase.kind === 'error' ? (
        <Button label="Try again" variant="primary" size="lg" fullWidth onPress={locate} />
      ) : null}
      <Button label="Cancel" variant="quiet" size="lg" fullWidth onPress={onClose} />
    </Stack>
  );
}

/** The sheet itself. Its contents mount only while it is open, so each opening starts fresh. */
export function LocationShareSheet({
  visible,
  onClose,
  onConfirm,
  sending,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (place: PickedLocation) => void;
  sending?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Share your location"
      subtitle="Only the person you are trading with will see it."
      bottomInset={insets.bottom}
    >
      <LocationFinder onClose={onClose} onConfirm={onConfirm} sending={sending} />
    </Sheet>
  );
}
