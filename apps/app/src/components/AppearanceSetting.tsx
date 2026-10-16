import { View } from 'react-native';

import { SegmentedControl, Stack, Text } from '@pandam/ui';

import { type ColorScheme, useUiStore } from '@/store/ui';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly { value: ColorScheme; label: string }[];

/** Light / Dark / System selector. Applies immediately and is remembered. */
export function AppearanceSetting() {
  const scheme = useUiStore((s) => s.colorScheme);
  const setScheme = useUiStore((s) => s.setColorScheme);

  return (
    <Stack gap="md">
      <View>
        <Text variant="h3">Appearance</Text>
        <Text variant="caption" tone="muted">
          Choose Light or Dark, or follow your device&apos;s setting.
        </Text>
      </View>
      <SegmentedControl options={OPTIONS} value={scheme} onChange={setScheme} />
    </Stack>
  );
}
