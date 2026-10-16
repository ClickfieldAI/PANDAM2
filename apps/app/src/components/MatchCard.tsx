import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { type ReciprocalMatchView } from '@pandam/types';
import {
  Avatar,
  Badge,
  ConnectingPair,
  CoverTile,
  Gradient,
  Press,
  Row,
  Text,
  radii,
  shadows,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { mediaSrc } from '@/lib/api/media';
import { categoryIcon } from '@/lib/icons';

/** One leg of the trade: what moves in a single direction. */
function Leg({
  direction,
  title,
  categoryName,
  categorySlug,
  mirrors,
}: {
  direction: 'give' | 'get';
  title: string;
  categoryName: string;
  categorySlug: string;
  /** The other side's record this leg satisfies. */
  mirrors: string;
}) {
  const colors = useThemeColors();

  const give = direction === 'give';
  const tint = give ? colors.accent : colors.need;
  const soft = give ? colors.accentSoft : colors.needSoft;
  const strong = give ? colors.accentStrong : colors.needStrong;

  return (
    <Row gap="md" align="center">
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radii.md,
          backgroundColor: soft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={categoryIcon(categorySlug)} size={20} color={tint} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Row gap="xs">
          <Ionicons
            name={give ? 'arrow-up-circle' : 'arrow-down-circle'}
            size={12}
            color={strong}
          />
          <Text variant="overline" caps style={{ color: strong }}>
            {give ? 'You give' : 'You get'}
          </Text>
        </Row>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {/*
          The reason this leg works, in the fewest possible words. Without it
          the card is two item titles; with it, it is an argument.
        */}
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {categoryName} · {give ? 'they need' : 'you need'} “{mirrors}”
        </Text>
      </View>
    </Row>
  );
}

/** An item as a physical object on the match stage: its real photo, or its cover. */
function ObjectFace({ id, slug, imageUrl }: { id: string; slug: string; imageUrl: string | null }) {
  return (
    <CoverTile
      seed={id}
      uri={mediaSrc(imageUrl)}
      height={200}
      radius="none"
      icon={<Ionicons name={categoryIcon(slug)} size={52} color="rgba(255,253,249,0.6)" />}
      style={{ flex: 1 }}
    />
  );
}

export interface MatchCardProps {
  match: ReciprocalMatchView;
  onPress?: () => void;
}

/**
 * Makes the reciprocal barter obvious. The API returns four records, but they
 * are only two legs of one trade — showing "you give / you get" instead of all
 * four titles is what turns a data dump into something a person can act on.
 *
 * This is the one component in PANDAM allowed to use a gradient and to sit at
 * a larger radius than everything else. That is the whole point of having
 * reserved them: a match is the moment the product exists for, and it can only
 * feel like an event if nothing else on the screen is shouting too.
 */
export function MatchCard({ match, onPress }: MatchCardProps) {
  const colors = useThemeColors();

  const them = match.them.user.displayName;

  return (
    <Press
      scale="sm"
      lift
      accessibilityLabel={`Barter match with ${them}`}
      onPress={onPress}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: colors.matchBorder,
          overflow: 'hidden',
        },
        shadows.sm,
      ]}
      states={{ hover: { borderColor: colors.match } }}
    >
      {/*
        The stage: your thing and their thing, as objects, tilting in toward
        each other and joined by a pulsing exchange link. This is the moment
        the product exists for, so it is the one place with real 3D motion.
      */}
      <Gradient
        colors={[colors.matchSoft, colors.surface]}
        direction="vertical"
        style={{ paddingTop: spacing.lg, paddingBottom: spacing.md }}
      >
        <ConnectingPair
          size={96}
          left={
            <ObjectFace
              id={match.you.have.id}
              slug={match.you.have.category.slug}
              imageUrl={match.you.have.imageUrl}
            />
          }
          right={
            <ObjectFace
              id={match.them.have.id}
              slug={match.them.have.category.slug}
              imageUrl={match.them.have.imageUrl}
            />
          }
          link={<Ionicons name="swap-horizontal" size={18} color={colors.textInverse} />}
        />
      </Gradient>
      <Gradient
        token="match"
        direction="horizontal"
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <Row gap="xs">
          <Ionicons name="sparkles" size={14} color={colors.textInverse} />
          <Text variant="overline" caps tone="inverse">
            Barter match
          </Text>
        </Row>
        <Row gap="xs">
          <Avatar name={them} size={22} ring uri={mediaSrc(match.them.user.avatarUrl)} />
          <Text variant="caption" tone="inverse" numberOfLines={1}>
            {them}
          </Text>
        </Row>
      </Gradient>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Leg
          direction="give"
          title={match.you.have.title}
          categoryName={match.you.have.category.name}
          categorySlug={match.you.have.category.slug}
          mirrors={match.them.need.title}
        />

        <Row gap="sm" align="center">
          <View style={{ flex: 1, height: 1, backgroundColor: colors.borderSoft }} />
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: radii.pill,
              backgroundColor: colors.matchSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="swap-vertical" size={15} color={colors.match} />
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.borderSoft }} />
        </Row>

        <Leg
          direction="get"
          title={match.them.have.title}
          categoryName={match.them.have.category.name}
          categorySlug={match.them.have.category.slug}
          mirrors={match.you.need.title}
        />
      </View>

      <Row
        justify="space-between"
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.borderSoft,
          backgroundColor: colors.matchSoft,
        }}
      >
        <Badge label="Even trade" kind="match" dot />
        <Row gap="xs">
          <Text variant="label" tone="match">
            View match
          </Text>
          <Ionicons name="chevron-forward" size={13} color={colors.matchText} />
        </Row>
      </Row>
    </Press>
  );
}
