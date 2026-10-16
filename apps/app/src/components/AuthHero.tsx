import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import {
  FloatingObject,
  Gradient,
  Text,
  radii,
  shadows,
  spacing,
  useThemeColors,
} from '@pandam/ui';

/**
 * The header on the two unauthenticated screens.
 *
 * It does one job: explain barter in the two seconds before someone decides
 * whether to sign up. So instead of a logo tile and a tagline, it draws the
 * actual mechanic — a thing you have, a thing you want, and the swap between
 * them. That composition is specific to this product; a centred wordmark
 * would work equally well for any app, which is exactly the problem with one.
 *
 * This is one of only four places allowed to use a gradient (see the art
 * direction note in `@pandam/ui/tokens`) — it is the product's front door.
 */
export function AuthHero() {
  const colors = useThemeColors();

  return (
    <Gradient
      token="hero"
      direction="vertical"
      style={{
        paddingTop: spacing['5xl'],
        paddingHorizontal: spacing['2xl'],
        paddingBottom: spacing['3xl'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: radii.sm,
            backgroundColor: 'rgba(255,253,249,0.16)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="swap-horizontal" size={14} color={colors.textInverse} />
        </View>
        <Text variant="h3" tone="inverse" style={{ letterSpacing: 0.2 }}>
          Pandam
        </Text>
      </View>
      <Text variant="hero" tone="inverse" style={{ marginTop: spacing.sm }}>
        Trade what you have
      </Text>
      <Text variant="hero" style={{ color: 'rgba(255,255,255,0.58)' }}>
        for what you need
      </Text>

      {/* The mechanic, drawn. Two sides and the exchange between them. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing['2xl'],
        }}
      >
        <FloatingObject style={{ flex: 1 }} amplitude={4} rotate={2}>
          <SwapToken icon="camera-outline" label="Your camera" />
        </FloatingObject>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: radii.pill,
            backgroundColor: colors.match,
            ...shadows.sm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="swap-horizontal" size={14} color={colors.textInverse} />
        </View>
        <FloatingObject style={{ flex: 1 }} amplitude={4} rotate={2} delay={900}>
          <SwapToken icon="laptop-outline" label="Their MacBook" />
        </FloatingObject>
      </View>

      <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)', marginTop: spacing.lg }}>
        No money, no credits, no points. Just a fair swap.
      </Text>
    </Gradient>
  );
}

/** One side of the swap. Deliberately plain: the composition is the idea. */
function SwapToken({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(255,253,249,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,253,249,0.2)',
        borderRadius: radii.lg,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
      }}
    >
      <Ionicons name={icon} size={15} color="rgba(255,255,255,0.82)" />
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ color: 'rgba(255,255,255,0.82)', flexShrink: 1 }}
      >
        {label}
      </Text>
    </View>
  );
}
