/**
 * Offer Details building blocks, built to the supplied mockup: a "You give"
 * card (pale pink), a swap divider, a "You get" card (neutral), a message
 * card and a bottom action panel. Presentation only.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Press } from '@pandam/ui';

import { useM } from '@/components/matches/MatchesUI';
import { useThemeColors } from '@pandam/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];
const BOLD = 'InterTight_700Bold';
const SEMI = 'InterTight_600SemiBold';
const REG = 'InterTight_400Regular';

export function OfferItemCard({
  label,
  title,
  meta,
  tone,
}: {
  label: string;
  title: string;
  meta: string[];
  tone: 'give' | 'get';
}) {
  const M = useM();

  const colors = useThemeColors();

  const give = tone === 'give';
  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1.4,
        borderColor: give ? M.red : M.ink,
        backgroundColor: give ? M.pink : M.track,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 4,
      }}
    >
      <Text style={{ fontFamily: REG, fontSize: 15, color: give ? M.red : M.secondary }}>
        {label}
      </Text>
      <Text style={{ fontFamily: BOLD, fontSize: 24, lineHeight: 29, color: M.ink }}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {meta.map((m, i) => (
          <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {i > 0 ? (
              <View
                style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted }}
              />
            ) : null}
            <Text style={{ fontFamily: REG, fontSize: 15, color: colors.textMuted }}>{m}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function SwapDivider() {
  const M = useM();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14 }}>
      <View style={{ flex: 1, height: 1.2, backgroundColor: M.inkFill }} />
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          marginHorizontal: 10,
          borderWidth: 1.4,
          borderColor: M.line,
          backgroundColor: M.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="swap-vertical" size={24} color={M.red} />
      </View>
      <View style={{ flex: 1, height: 1.2, backgroundColor: M.inkFill }} />
    </View>
  );
}

export function MessageCard({ label, children }: { label: string; children: ReactNode }) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1.4,
        borderColor: M.line,
        backgroundColor: colors.surface,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 8,
      }}
    >
      <Text style={{ fontFamily: SEMI, fontSize: 15, color: colors.textMuted }}>{label}</Text>
      {children}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  icon,
  kind,
  loading,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  kind: 'primary' | 'outline' | 'text';
  loading?: boolean;
}) {
  const M = useM();

  const colors = useThemeColors();

  if (kind === 'text') {
    return (
      <Press
        haptic="light"
        scale="md"
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={loading}
        onPress={onPress}
        hitSlop={8}
        style={{ alignSelf: 'center', paddingVertical: 10 }}
      >
        <Text style={{ fontFamily: SEMI, fontSize: 16, color: colors.textSecondary }}>{label}</Text>
      </Press>
    );
  }
  const primary = kind === 'primary';
  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      states={primary ? { pressed: { backgroundColor: M.redPressed } } : undefined}
      style={{
        height: 56,
        borderRadius: 9,
        borderWidth: 1.4,
        borderColor: primary ? '#3A1410' : M.line,
        backgroundColor: primary ? M.red : M.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {icon ? <Ionicons name={icon} size={23} color={primary ? '#fff' : M.ink} /> : null}
      <Text style={{ fontFamily: SEMI, fontSize: 17.5, color: primary ? '#fff' : M.ink }}>
        {loading ? 'Please wait…' : label}
      </Text>
    </Press>
  );
}

/** Green confirmation row ("Trade Accepted"), tappable when it has a destination. */
export function AcceptedPanel({ onPress }: { onPress?: () => void }) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <Press
      haptic="light"
      scale="sm"
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="Trade Accepted"
      onPress={onPress}
      style={{
        height: 58,
        borderRadius: 9,
        backgroundColor: colors.successSoft,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Ionicons name="shield-checkmark" size={28} color={M.red} />
      <Text style={{ flex: 1, fontFamily: SEMI, fontSize: 18, color: colors.successText }}>
        Trade Accepted
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
    </Press>
  );
}

/** The rounded sheet pinned to the bottom of the screen. */
export function BottomPanel({
  children,
  bottomInset,
}: {
  children: ReactNode;
  bottomInset: number;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderTopLeftRadius: 26,
        borderTopRightRadius: 26,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.borderSoft,
        backgroundColor: colors.surface,
        paddingHorizontal: 20,
        paddingTop: 22,
        paddingBottom: bottomInset + 14,
        gap: 12,
      }}
    >
      {children}
    </View>
  );
}
