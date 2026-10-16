import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Row, Stack, Text, radii, spacing, useThemeColors } from '@pandam/ui';

type IconName = keyof typeof Ionicons.glyphMap;

/** Account ✓ → Identity (current) → Complete ○ */
export function StepProgress({ current }: { current: 'identity' | 'complete' }) {
  const colors = useThemeColors();

  const steps = [
    { key: 'account', label: 'Account' },
    { key: 'identity', label: 'Identity' },
    { key: 'complete', label: 'Complete' },
  ] as const;
  const index = current === 'identity' ? 1 : 2;
  return (
    <Row gap="xs" align="center">
      {steps.map((s, i) => {
        const done = i < index || (current === 'complete' && i === 2);
        const active = i === index && !done;
        return (
          <Row key={s.key} gap="xs" align="center" style={{ flex: i < 2 ? 1 : undefined }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done ? colors.match : active ? colors.accent : colors.surface,
                borderWidth: done || active ? 0 : 1.5,
                borderColor: colors.borderStrong,
              }}
            >
              {done ? (
                <Ionicons name="checkmark" size={14} color={colors.textInverse} />
              ) : (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: active ? colors.textInverse : colors.textMuted,
                  }}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            <Text
              variant="caption"
              style={{ fontWeight: active || done ? '700' : '500' }}
              tone={active ? 'accent' : done ? 'match' : 'muted'}
            >
              {s.label}
            </Text>
            {i < 2 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  borderRadius: 1,
                  marginHorizontal: spacing.xs,
                  backgroundColor: done ? colors.match : colors.border,
                }}
              />
            ) : null}
          </Row>
        );
      })}
    </Row>
  );
}

export function CheckRow({
  children,
  icon = 'checkmark-circle',
}: {
  children: ReactNode;
  icon?: IconName;
}) {
  const colors = useThemeColors();

  return (
    <Row gap="sm" align="flex-start">
      <Ionicons name={icon} size={18} color={colors.match} style={{ marginTop: 1 }} />
      <Text variant="body" style={{ flex: 1 }}>
        {children}
      </Text>
    </Row>
  );
}

/** Round icon badge used at the top of each step. */
export function StepIcon({
  name,
  tone = 'accent',
}: {
  name: IconName;
  tone?: 'accent' | 'match' | 'danger' | 'muted';
}) {
  const colors = useThemeColors();

  const bg =
    tone === 'match'
      ? colors.matchSoft
      : tone === 'danger'
        ? colors.dangerSoft
        : tone === 'muted'
          ? colors.surfaceMuted
          : colors.accentSoft;
  const fg =
    tone === 'match'
      ? colors.match
      : tone === 'danger'
        ? colors.danger
        : tone === 'muted'
          ? colors.textMuted
          : colors.accent;
  return (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: radii.lg,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={30} color={fg} />
    </View>
  );
}

/** A full-screen state: working (spinner), success, or problem — never a dead end. */
export function StatusState({
  kind,
  title,
  body,
  children,
}: {
  kind: 'working' | 'success' | 'problem';
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const colors = useThemeColors();

  return (
    <Stack gap="lg" align="center" style={{ paddingVertical: spacing['3xl'] }}>
      {kind === 'working' ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: kind === 'success' ? colors.match : colors.dangerSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={kind === 'success' ? 'checkmark' : 'alert'}
            size={36}
            color={kind === 'success' ? colors.textInverse : colors.danger}
          />
        </View>
      )}
      <Stack gap="xs" align="center">
        <Text variant="h1" center accessibilityLiveRegion="polite">
          {title}
        </Text>
        {body ? (
          <Text variant="body" tone="secondary" center style={{ maxWidth: 340 }}>
            {body}
          </Text>
        ) : null}
      </Stack>
      {children ? (
        <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
          {children}
        </Stack>
      ) : null}
    </Stack>
  );
}
