import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  Card,
  Divider,
  Press,
  Reveal,
  Row,
  Screen,
  Stack,
  Text,
  radii,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';

/**
 * One of the two things you can add.
 *
 * Previously a full-bleed gradient card with a 140px watermark icon behind
 * the text. The decision here is genuinely binary and genuinely important, so
 * the card is given real presence — but through size, spacing and a single
 * coloured edge rather than through a coloured slab. What it is for is now
 * readable in one pass instead of competing with its own background.
 */
function BigChoice({
  number,
  edge,
  icon,
  title,
  body,
  examples,
  onPress,
}: {
  number: string;
  edge: 'accent' | 'need';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  examples: string[];
  onPress: () => void;
}) {
  const colors = useThemeColors();

  // "I NEED" deliberately stays structural (white/black), not a second brand
  // colour — only "I HAVE" gets the orange fill. See tokens.ts art direction.
  const isHave = edge === 'accent';
  const fill = isHave ? colors.accent : colors.surface;
  const fg = isHave ? colors.textInverse : colors.textPrimary;
  const fgMuted = isHave ? 'rgba(255,255,255,0.75)' : colors.textSecondary;

  return (
    <Press
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{
        backgroundColor: fill,
        borderRadius: radii.lg,
        borderWidth: 1.5,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
        <Row justify="space-between" align="flex-start">
          <Text
            style={{
              fontFamily: 'InterTight_800ExtraBold',
              fontSize: 40,
              lineHeight: 42,
              letterSpacing: -1.2,
              color: isHave ? 'rgba(255,255,255,0.55)' : colors.textFaint,
            }}
          >
            {number}
          </Text>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.md,
              borderWidth: 1.5,
              borderColor: isHave ? 'rgba(255,255,255,0.4)' : colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={icon} size={18} color={fg} />
          </View>
        </Row>

        <View style={{ gap: spacing.xs }}>
          <Text
            style={{
              fontFamily: 'InterTight_800ExtraBold',
              fontSize: 26,
              lineHeight: 28,
              letterSpacing: -0.6,
              color: fg,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </Text>
          <Text variant="bodySm" style={{ color: fgMuted }}>
            {body}
          </Text>
        </View>

        {/* Examples as plain text, not as pill badges. Three pills for three
            nouns reads as a feature list on a pricing page; a quiet line of
            examples reads as help. */}
        <Text variant="caption" style={{ color: fgMuted }}>
          {examples.join(' · ')}
        </Text>

        <Row gap="xs" align="center">
          <Text
            variant="label"
            style={{ color: fg, fontFamily: 'InterTight_700Bold', letterSpacing: 0.4 }}
          >
            GET STARTED
          </Text>
          <Ionicons name="arrow-forward" size={14} color={fg} />
        </Row>
      </View>
    </Press>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  const colors = useThemeColors();

  return (
    <Row gap="md" align="flex-start">
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: colors.matchBorder,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="caption" numeric style={{ color: colors.matchText, fontWeight: '600' }}>
          {n}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="bodySm" tone="secondary">
          {body}
        </Text>
      </View>
    </Row>
  );
}

export default function CreateScreen() {
  const colors = useThemeColors();

  const router = useRouter();

  return (
    <Screen scroll tabBarInset>
      <AppHeader
        title="Add to the marketplace"
        subtitle="Barter works when both sides list what they have and what they want."
      />

      <Stack gap="xl">
        <Reveal index={0}>
          <BigChoice
            number="01"
            edge="accent"
            icon="cube-outline"
            title="I have"
            body="Something you can put on the table — an object, your time, or a skill."
            examples={['A camera', 'Two hours of tutoring', 'Logo design']}
            onPress={() => router.push('/(app)/new-listing')}
          />
        </Reveal>

        <Reveal index={1}>
          <BigChoice
            number="02"
            edge="need"
            icon="search-outline"
            title="I need"
            body="Something you are looking for. We watch for people who have it and want what you offer."
            examples={['A bike repair', 'Wedding photos', 'Help moving flat']}
            onPress={() => router.push('/(app)/new-need')}
          />
        </Reveal>

        <Card padded radius="xl">
          <Stack gap="lg">
            <Row gap="sm">
              <Ionicons name="sparkles" size={15} color={colors.match} />
              <Text variant="label" tone="match">
                How a barter match happens
              </Text>
            </Row>

            <Divider tone="soft" />

            <Stack gap="lg">
              <Step
                n={1}
                title="You list both sides"
                body="What you can offer, and what you are after."
              />
              <Step
                n={2}
                title="We look for the mirror"
                body="Someone who has what you need and needs what you have."
              />
              <Step
                n={3}
                title="You trade directly"
                body="Goods for goods. No money, no credits, no wallet."
              />
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Screen>
  );
}
