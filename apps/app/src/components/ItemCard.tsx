import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { type MarketItem } from '@pandam/types';
import {
  Avatar,
  Badge,
  Card,
  CoverTile,
  Meta,
  MetaItem,
  Press,
  Row,
  Text,
  colors,
  radii,
  shadows,
  spacing,
} from '@pandam/ui';

import { SaveHeart } from '@/components/brand/SaveHeart';
import { mediaSrc, primaryImage } from '@/lib/api/media';
import { STATUS_LABEL, TYPE_LABEL, formatMoney, statusBadgeKind, timeAgo } from '@/lib/format';
import { categoryIcon } from '@/lib/icons';

export interface ItemCardProps {
  item: MarketItem;
  onPress?: () => void;
  /** Show the owner row (hidden on "my items" lists). */
  showOwner?: boolean;
  /** Show the publication-status badge (used on the profile / "mine" lists). */
  showStatus?: boolean;
  /** `list` is a full-width row, `grid` a half-width tile, `rail` a fixed-width tile,
   *  `feature` a large photo-led hero card. */
  variant?: 'list' | 'grid' | 'rail' | 'feature';
}

/**
 * The HAVE / NEED marker.
 *
 * A solid capsule on the photo, and a bar + word off it. Reads as one confident
 * shape at thumbnail size — the single most important fact about any item.
 */
function KindMark({ isHave, onPhoto = false }: { isHave: boolean; onPhoto?: boolean }) {
  const color = isHave ? colors.accent : colors.need;

  if (onPhoto) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          backgroundColor: color,
          borderRadius: radii.sm,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Ionicons name={isHave ? 'pricetag' : 'search'} size={10} color={colors.textInverse} />
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: '800',
            letterSpacing: 0.4,
            color: colors.textInverse,
          }}
        >
          {isHave ? 'HAVE' : 'WANTS'}
        </Text>
      </View>
    );
  }

  return (
    <Row gap="xs">
      <View style={{ width: 3, height: 11, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" tone={isHave ? 'accent' : 'need'} style={{ fontWeight: '700' }}>
        {isHave ? 'Have' : 'Need'}
      </Text>
    </Row>
  );
}

/**
 * The trade affordance — PANDAM's equivalent of Blinkit's "ADD" button: a
 * small, confident, brand-coloured pill in the corner of every card that
 * makes the primary action unmistakable at a glance. Purely visual: the whole
 * card is the tap target, so this never nests a second pressable.
 */
function TradePill({ isHave, compact = false }: { isHave: boolean; compact?: boolean }) {
  const color = isHave ? colors.accent : colors.need;
  return (
    <View
      accessibilityElementsHidden
      style={{
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 30,
        minWidth: 30,
        backgroundColor: isHave ? colors.accentSoft : colors.needSoft,
        borderWidth: 1,
        borderColor: isHave ? colors.accentBorder : colors.needBorder,
        borderRadius: radii.sm,
        paddingHorizontal: compact ? 0 : 9,
      }}
    >
      <Ionicons name="swap-horizontal" size={14} color={color} />
      {compact ? null : (
        <Text
          style={{ fontSize: 12, lineHeight: 15, fontWeight: '800', color, letterSpacing: 0.2 }}
        >
          Trade
        </Text>
      )}
    </View>
  );
}

/** A dot separator for dense metadata rows. */
function Dot() {
  return (
    <View style={{ width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: colors.textFaint }} />
  );
}

/**
 * A listing ("I HAVE") or need ("I NEED") card.
 *
 * Photo-forward and dense: the image fills the top edge-to-edge, the title and
 * one line of concrete metadata (place · when) sit tight beneath it, and the
 * trade action reads as a coloured pill in the corner. No tilt, no floating
 * decoration — the photograph and the price do the work, the way a real
 * marketplace card does.
 */
export function ItemCard({
  item,
  onPress,
  showOwner = true,
  showStatus = false,
  variant = 'list',
}: ItemCardProps) {
  const isHave = item.kind === 'listing';
  const icon = categoryIcon(item.category.slug);
  const cover = primaryImage(item.images);
  const price = item.pricing?.priceAmount;
  const label = `${isHave ? 'Have' : 'Need'}: ${item.title}`;
  const [hovered, setHovered] = useState(false);
  // Narrow tiles (small phones, 2-up grid) switch the Trade pill to icon-only
  // so it never collides with the price.
  const [tileW, setTileW] = useState(0);
  const compact = tileW > 0 && tileW < 170;
  const zoom = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(hovered ? 1.06 : 1, { damping: 20, stiffness: 160 }) }],
  }));

  const place = item.owner.locationCity;
  const when = timeAgo(item.createdAt);

  /* ------------------------------------------------------------- feature -- */
  if (variant === 'feature') {
    return (
      <View>
        <Press
          haptic="light"
          scale="sm"
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.xl,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            ...shadows.sm,
          }}
          states={{ hover: { ...shadows.md, borderColor: colors.borderStrong } }}
        >
          <View style={{ height: 260, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}>
            <Animated.View style={[{ flex: 1 }, zoom]}>
              <CoverTile
                seed={item.id}
                height={260}
                radius="none"
                uri={cover}
                style={{ position: 'absolute', inset: 0, height: '100%' }}
                icon={<Ionicons name={icon} size={120} color="rgba(255,255,255,0.5)" />}
              />
            </Animated.View>
            <View
              style={{
                position: 'absolute',
                top: spacing.md,
                left: spacing.md,
                flexDirection: 'row',
                gap: spacing.xs,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: radii.sm,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: '800',
                    letterSpacing: 0.8,
                    color: colors.textInverse,
                  }}
                >
                  FRESH TODAY
                </Text>
              </View>
            </View>
            <View
              style={{
                position: 'absolute',
                left: spacing.lg,
                right: spacing.lg,
                bottom: spacing.lg,
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 23,
                  lineHeight: 27,
                  fontWeight: '800',
                  letterSpacing: -0.5,
                  color: colors.textInverse,
                }}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Row gap="sm">
                <Avatar
                  name={item.owner.displayName}
                  size={20}
                  uri={mediaSrc(item.owner.avatarUrl)}
                />
                <Text
                  variant="bodySm"
                  style={{ color: 'rgba(255,253,249,0.92)' }}
                  numberOfLines={1}
                >
                  {item.owner.displayName}
                  {place ? ` · ${place}` : ''}
                </Text>
              </Row>
            </View>
          </View>
          <Row
            justify="space-between"
            align="center"
            style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
          >
            {price != null ? (
              <Row gap="xs" align="baseline">
                <Text variant="numericLarge" numeric style={{ fontWeight: '800' }}>
                  {formatMoney(price, item.pricing!.priceCurrency)}
                </Text>
                <Text variant="caption" tone="muted">
                  or trade
                </Text>
              </Row>
            ) : (
              <Row gap="xs" align="center">
                <Ionicons name="swap-horizontal" size={16} color={colors.accent} />
                <Text variant="bodyStrong" tone="accent">
                  Open to trade
                </Text>
              </Row>
            )}
            <TradePill isHave={isHave} />
          </Row>
        </Press>
        <View style={{ position: 'absolute', top: spacing.md, right: spacing.md }}>
          <SaveHeart />
        </View>
      </View>
    );
  }

  /* ---------------------------------------------------------------- tile -- */
  if (variant === 'grid' || variant === 'rail') {
    const isRail = variant === 'rail';
    return (
      <View
        style={{
          position: 'relative',
          flex: isRail ? undefined : 1,
          width: isRail ? 176 : undefined,
        }}
        onLayout={(e) => setTileW(e.nativeEvent.layout.width)}
      >
        <Press
          haptic="light"
          scale="sm"
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={{
            ...shadows.xs,
            backgroundColor: colors.surface,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
          states={{ hover: { ...shadows.md, borderColor: colors.borderStrong } }}
        >
          <View
            style={{ aspectRatio: 1.12, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}
          >
            <Animated.View style={[{ flex: 1 }, zoom]}>
              <CoverTile
                seed={item.id}
                height={200}
                radius="none"
                uri={cover}
                style={{ position: 'absolute', inset: 0, height: '100%' }}
                icon={<Ionicons name={icon} size={64} color="rgba(255,255,255,0.5)" />}
              />
            </Animated.View>
            <View style={{ position: 'absolute', top: spacing.sm, left: spacing.sm }}>
              <KindMark isHave={isHave} onPhoto />
            </View>
          </View>

          <View style={{ padding: spacing.md, gap: 5 }}>
            <Text
              variant="bodyStrong"
              numberOfLines={2}
              style={{ minHeight: 40, letterSpacing: -0.2, lineHeight: 20 }}
            >
              {item.title}
            </Text>

            {/* place · when — concrete data, the marketplace signal */}
            <Row gap="xs" align="center" style={{ minHeight: 16 }}>
              {place ? (
                <>
                  <Ionicons name="location" size={11} color={colors.textFaint} />
                  <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {place}
                  </Text>
                </>
              ) : (
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {item.category.name}
                </Text>
              )}
              <Dot />
              <Text variant="caption" tone="faint" numberOfLines={1}>
                {when}
              </Text>
            </Row>

            <Row
              justify="space-between"
              align="center"
              gap="sm"
              style={{ marginTop: 3, minHeight: 30 }}
            >
              {price != null ? (
                <Text
                  variant="numeric"
                  numeric
                  numberOfLines={1}
                  style={{ fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 }}
                >
                  {formatMoney(price, item.pricing!.priceCurrency)}
                </Text>
              ) : (
                <Text
                  variant="label"
                  tone={isHave ? 'accent' : 'need'}
                  numberOfLines={1}
                  style={{ fontWeight: '700', flexShrink: 1 }}
                >
                  Barter only
                </Text>
              )}
              {showStatus ? (
                <Badge label={STATUS_LABEL[item.status]} kind={statusBadgeKind(item.status)} dot />
              ) : (
                <TradePill isHave={isHave} compact={compact} />
              )}
            </Row>
          </View>
        </Press>
        <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm }}>
          <SaveHeart size={30} />
        </View>
      </View>
    );
  }

  /* ---------------------------------------------------------------- list -- */
  return (
    <Card onPress={onPress} padded={false} accessibilityLabel={label}>
      <Row gap="md" align="flex-start" style={{ padding: spacing.md }}>
        <CoverTile
          seed={item.id}
          height={88}
          radius="lg"
          uri={cover}
          icon={<Ionicons name={icon} size={44} color="rgba(255,255,255,0.5)" />}
          style={{ width: 88 }}
        />

        <View style={{ flex: 1, gap: spacing.xs, minWidth: 0 }}>
          <Row justify="space-between" gap="sm" align="center">
            <KindMark isHave={isHave} />
            <Row gap="xs">
              {showStatus ? (
                <Badge label={STATUS_LABEL[item.status]} kind={statusBadgeKind(item.status)} dot />
              ) : null}
              <Text variant="caption" tone="faint">
                {when}
              </Text>
            </Row>
          </Row>

          <Text variant="h3" numberOfLines={2}>
            {item.title}
          </Text>

          <Text variant="bodySm" tone="secondary" numberOfLines={2}>
            {item.description}
          </Text>

          <Row justify="space-between" gap="sm" align="center" style={{ marginTop: spacing.xxs }}>
            <Meta>
              <MetaItem
                icon={<Ionicons name={icon} size={11} color={colors.textMuted} />}
                label={item.category.name}
              />
              <MetaItem label={TYPE_LABEL[item.type]} />
              {showOwner ? <MetaItem label={item.owner.displayName} /> : null}
            </Meta>

            {price != null ? (
              <Text variant="numeric" numeric tone="need" style={{ fontWeight: '800' }}>
                {formatMoney(price, item.pricing!.priceCurrency)}
              </Text>
            ) : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}
