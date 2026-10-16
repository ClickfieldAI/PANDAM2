import { type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { Reveal, Text, radii, spacing, useThemeColors } from '@pandam/ui';

import { ProductComposition } from './ProductComposition';
import { Wordmark } from './Wordmark';

/**
 * The composition around the (unchanged) sign-in / sign-up forms.
 *
 * Desktop/tablet-landscape: two columns. The LEFT is the brand experience —
 * wordmark, tagline and the layered product still life, which parallaxes with
 * the pointer. The RIGHT is a compact premium card, vertically centred, never
 * stretched across empty space.
 *
 * Phone: an intentional order rather than a stacked desktop — brand first,
 * then a compact product composition, then the form in a card that overlaps
 * the composition slightly so the page reads as one piece and the form starts
 * above the fold.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();

  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const card = (
    <View
      style={{
        width: '100%',
        maxWidth: 440,
        alignSelf: 'center',
        backgroundColor: colors.surface,
        borderRadius: radii['2xl'],
        borderWidth: 1,
        borderColor: colors.border,
        padding: wide ? spacing['3xl'] : spacing['2xl'],
        gap: spacing['2xl'],
        shadowColor: '#5A3A22',
        shadowOpacity: 0.1,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 20 },
        elevation: 10,
      }}
    >
      <View style={{ gap: spacing.xs }}>
        <Text
          style={{
            fontSize: wide ? 30 : 26,
            lineHeight: wide ? 35 : 31,
            fontWeight: '700',
            letterSpacing: -0.8,
            color: colors.textPrimary,
          }}
        >
          {title}
        </Text>
        <Text variant="body" tone="secondary">
          {subtitle}
        </Text>
      </View>
      {children}
    </View>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', minHeight: '100%' as unknown as number }}>
        <View
          style={{
            flex: 1.15,
            paddingHorizontal: spacing['5xl'],
            paddingVertical: spacing['4xl'],
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <Wordmark size="md" />
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: spacing['2xl'] }}>
            <ProductComposition
              layout="stack"
              height={Math.min(560, Math.max(420, width * 0.36))}
            />
          </View>
          <View style={{ gap: spacing.sm, maxWidth: 520 }}>
            <Text
              style={{
                fontSize: 44,
                lineHeight: 48,
                fontWeight: '800',
                letterSpacing: -1.6,
                color: colors.textPrimary,
              }}
            >
              Real things.{'\n'}
              <Text
                style={{
                  fontSize: 44,
                  lineHeight: 48,
                  fontWeight: '800',
                  letterSpacing: -1.6,
                  color: colors.accent,
                }}
              >
                New possibilities.
              </Text>
            </Text>
            <Text variant="body" tone="secondary">
              Trade the things you have for the things you need — with real people, nearby.
            </Text>
          </View>
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing['3xl'],
            paddingVertical: spacing['3xl'],
            backgroundColor: colors.backgroundSecondary,
            borderTopLeftRadius: 48,
            borderBottomLeftRadius: 48,
          }}
        >
          <Reveal offset={18}>{card}</Reveal>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: spacing['2xl'] }}>
      <View style={{ paddingHorizontal: spacing.xl }}>
        <Wordmark size="sm" tagline />
      </View>
      <ProductComposition
        layout="compact"
        height={Math.min(290, width * 0.74)}
        style={{ marginTop: spacing.sm }}
      />
      <View
        style={{
          paddingHorizontal: spacing.lg,
          marginTop: -spacing.xl,
          paddingBottom: spacing['2xl'],
          zIndex: 10,
        }}
      >
        <Reveal offset={18}>{card}</Reveal>
      </View>
    </View>
  );
}
