/**
 * Discover's visual layer, built to the supplied reference design.
 *
 * Presentation only: data, filtering, paging and navigation stay in
 * `app/(app)/(tabs)/discover.tsx`. Product photos are always the listing's own
 * image (via `CoverTile`); nothing from the reference is reused as content.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useRef } from 'react';
import { ScrollView, TextInput, View, Text, useWindowDimensions } from 'react-native';

import { type Category, type MarketItem } from '@pandam/types';
import { Avatar, CoverTile, Press, haptic } from '@pandam/ui';

import { SaveHeart } from '@/components/brand/SaveHeart';
import { M, RedBlob } from '@/components/matches/MatchesUI';
import { mediaSrc, primaryImage } from '@/lib/api/media';
import { formatMoney, timeAgo } from '@/lib/format';
import { categoryIcon } from '@/lib/icons';

export const GUTTER = 20;
export const GRID_GAP = 12;
const TITLE = 'InterTight_900Black';
const BOLD = 'InterTight_700Bold';
const SEMI = 'InterTight_600SemiBold';
const REG = 'InterTight_400Regular';

/** The colour of the active side: red for HAVE, the app's NEED colour otherwise. */
const toneColor = (isHave: boolean, need: string) => (isHave ? M.red : need);

/* ---------------------------------- header --------------------------------- */

export function DiscoverDecor() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 430);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      {/* Red shape first (behind): large, bleeding off the top and right edges. */}
      <View style={{ position: 'absolute', zIndex: 1, top: -64, right: -w * 0.14 }}>
        <RedBlob width={w * 0.64} height={w * 0.68} />
      </View>
    </View>
  );
}

export function DiscoverHeader({
  isHave,
  needColor,
  query,
  onQuery,
  filterActive,
  onFilter,
  onKind,
}: {
  isHave: boolean;
  needColor: string;
  query: string;
  onQuery: (v: string) => void;
  filterActive: boolean;
  onFilter: () => void;
  onKind: (haveSide: boolean) => void;
}) {
  const accent = toneColor(isHave, needColor);
  const sides = [
    { have: true, label: 'I HAVE' },
    { have: false, label: 'I NEED' },
  ];
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 10 }}>
      <Text
        style={{
          fontFamily: BOLD,
          fontSize: 14,
          letterSpacing: 0.4,
          color: accent,
          lineHeight: 18,
        }}
      >
        {isHave ? 'WHAT PEOPLE HAVE' : 'WHAT PEOPLE NEED'}
      </Text>
      <Text
        style={{
          fontFamily: TITLE,
          fontSize: 58,
          lineHeight: 60,
          letterSpacing: -3,
          color: M.ink,
          marginTop: 0,
        }}
      >
        DISCOVER
      </Text>

      <View
        style={{
          marginTop: 12,
          height: 48,
          borderRadius: 24,
          borderWidth: 1.4,
          borderColor: M.ink,
          backgroundColor: M.surface,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 5,
          gap: 10,
        }}
      >
        <Ionicons name="search" size={20} color={M.ink} />
        <TextInput
          value={query}
          onChangeText={onQuery}
          placeholder={isHave ? 'Search what people have' : 'Search what people need'}
          placeholderTextColor="#B4B2AC"
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search"
          style={{ flex: 1, fontFamily: REG, fontSize: 15, color: M.ink, padding: 0 }}
        />
        {query ? (
          <Press
            scale="lg"
            hitSlop={8}
            accessibilityLabel="Clear search"
            onPress={() => onQuery('')}
          >
            <Ionicons name="close-circle" size={18} color="#9A9892" />
          </Press>
        ) : null}
        <Press
          haptic="selection"
          scale="lg"
          accessibilityRole="button"
          accessibilityLabel="Filters"
          onPress={onFilter}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: filterActive ? accent : M.track,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="options-outline" size={20} color={filterActive ? '#FFFFFF' : M.ink} />
        </Press>
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          marginTop: 12,
          height: 50,
          borderRadius: 25,
          borderWidth: 1.5,
          borderColor: M.ink,
          backgroundColor: M.track,
          flexDirection: 'row',
          padding: 4,
        }}
      >
        {sides.map((s) => {
          const selected = s.have === isHave;
          return (
            <Press
              key={s.label}
              scale="none"
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) haptic.selection();
                onKind(s.have);
              }}
              style={{
                flex: 1,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? accent : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: BOLD,
                  fontSize: 14.5,
                  letterSpacing: 0.4,
                  color: selected ? '#FFFFFF' : M.ink,
                }}
              >
                {s.label}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/* -------------------------------- categories -------------------------------- */

const TILE = 56;
const TILE_W = 74;

type IconName = ComponentProps<typeof Ionicons>['name'];

export function CategoryTiles({
  categories,
  selectedId,
  onSelect,
  onAdd,
  accent,
}: {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  accent: string;
}) {
  const scroller = useRef<ScrollView>(null);

  const tile = (
    key: string,
    name: string,
    icon: IconName,
    selected: boolean,
    onPress: () => void,
    dashed = false,
  ) => (
    <Press
      key={key}
      scale="sm"
      haptic="selection"
      accessibilityRole={dashed ? 'button' : 'tab'}
      accessibilityState={dashed ? undefined : { selected }}
      accessibilityLabel={dashed ? 'Add a category' : name}
      onPress={onPress}
      style={{ width: TILE_W, alignItems: 'center', gap: 7 }}
    >
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: 18,
          // slightly irregular corners echo the reference's organic tiles
          borderTopLeftRadius: 20,
          borderBottomRightRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dashed ? 'transparent' : selected ? accent : M.track,
          borderWidth: dashed ? 1.5 : 0,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: accent,
        }}
      >
        <Ionicons name={icon} size={25} color={dashed ? accent : selected ? '#FFFFFF' : M.ink} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: selected ? BOLD : SEMI,
          fontSize: 11,
          lineHeight: 13,
          textAlign: 'center',
          color: dashed ? accent : M.ink,
          minHeight: 26,
        }}
      >
        {name}
      </Text>
    </Press>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingLeft: GUTTER - 4, paddingRight: 6, gap: 2 }}
      >
        {tile('all', 'All', 'apps', selectedId === null, () => onSelect(null))}
        {categories.map((c) =>
          tile(c.id, c.name, categoryIcon(c.slug), selectedId === c.id, () =>
            onSelect(selectedId === c.id ? null : c.id),
          ),
        )}
        {tile('add', 'Add', 'add', false, onAdd, true)}
      </ScrollView>
      <Press
        scale="lg"
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel="Show more categories"
        onPress={() => scroller.current?.scrollToEnd({ animated: true })}
        style={{
          width: 34,
          height: 34,
          marginTop: 11,
          marginRight: GUTTER - 6,
          marginLeft: 2,
          borderRadius: 17,
          backgroundColor: M.track,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="chevron-forward" size={17} color={M.ink} />
      </Press>
    </View>
  );
}

/* ------------------------------- listing cards ------------------------------ */

function TradeButton({ accent, compact }: { accent: string; compact?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: 32,
        paddingHorizontal: compact ? 8 : 14,
        borderRadius: 9,
        borderWidth: 1.2,
        borderColor: accent,
        backgroundColor: '#FFF3F1',
      }}
    >
      <Ionicons name="swap-horizontal" size={15} color={accent} />
      <Text style={{ fontFamily: SEMI, fontSize: 13, color: accent }}>Trade</Text>
    </View>
  );
}

/** The large lead card: photo with overlays above, "Open to trade" row below. */
export function FeatureCard({
  item,
  needColor,
  onPress,
}: {
  item: MarketItem;
  needColor: string;
  onPress: () => void;
}) {
  const isHave = item.kind === 'listing';
  const accent = toneColor(isHave, needColor);
  const price = item.pricing?.priceAmount;
  return (
    <View style={{ marginHorizontal: GUTTER, marginTop: 16 }}>
      <Press
        haptic="light"
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${isHave ? 'Have' : 'Need'}: ${item.title}`}
        onPress={onPress}
        style={{
          borderRadius: 22,
          overflow: 'hidden',
          backgroundColor: M.surface,
          borderWidth: 1,
          borderColor: M.border,
        }}
      >
        <View style={{ height: 220, backgroundColor: '#222' }}>
          <CoverTile
            seed={item.id}
            height={220}
            radius="none"
            uri={primaryImage(item.images)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' }}
            icon={
              <Ionicons
                name={categoryIcon(item.category.slug)}
                size={110}
                color="rgba(255,255,255,0.45)"
              />
            }
          />
          {/* scrim so the title stays legible on any photo */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 130,
              backgroundColor: 'rgba(0,0,0,0.42)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              backgroundColor: accent,
              borderRadius: 9,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 0.6, color: '#FFFFFF' }}>
              FRESH TODAY
            </Text>
          </View>
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 36 }}>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: TITLE,
                fontSize: 30,
                lineHeight: 32,
                letterSpacing: -1,
                color: '#FFFFFF',
              }}
            >
              {item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <Avatar
                name={item.owner.displayName}
                size={26}
                uri={mediaSrc(item.owner.avatarUrl)}
              />
              <Text
                numberOfLines={1}
                style={{ fontFamily: SEMI, fontSize: 14, color: '#FFFFFF', flexShrink: 1 }}
              >
                {item.owner.displayName}
              </Text>
            </View>
          </View>
          {(item.images?.length ?? 0) > 1 ? (
            <View
              style={{ position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', gap: 6 }}
            >
              {(item.images ?? []).slice(0, 5).map((im, i) => (
                <View
                  key={im.id}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i === 0 ? '#FFFFFF' : 'transparent',
                    borderWidth: 1.2,
                    borderColor: '#FFFFFF',
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 12,
            backgroundColor: '#FCFBF8',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Ionicons name="swap-horizontal" size={18} color={accent} />
            <Text
              numberOfLines={1}
              style={{ fontFamily: BOLD, fontSize: 15, color: accent, flexShrink: 1 }}
            >
              {price != null
                ? `${formatMoney(price, item.pricing!.priceCurrency)} or trade`
                : 'Open to trade'}
            </Text>
          </View>
          <TradeButton accent={accent} />
        </View>
      </Press>
      <View style={{ position: 'absolute', top: 12, right: 12 }}>
        <SaveHeart size={36} />
      </View>
    </View>
  );
}

/** One half-width grid card. */
export function GridCard({
  item,
  needColor,
  width,
  onPress,
}: {
  item: MarketItem;
  needColor: string;
  width: number;
  onPress: () => void;
}) {
  const isHave = item.kind === 'listing';
  const accent = toneColor(isHave, needColor);
  const price = item.pricing?.priceAmount;
  const imgH = Math.round(width * 0.9);
  return (
    <View style={{ width }}>
      <Press
        haptic="light"
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${isHave ? 'Have' : 'Need'}: ${item.title}`}
        onPress={onPress}
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: M.surface,
          borderWidth: 1,
          borderColor: M.border,
        }}
      >
        <View style={{ height: imgH, backgroundColor: M.track }}>
          <CoverTile
            seed={item.id}
            height={imgH}
            radius="none"
            uri={primaryImage(item.images)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' }}
            icon={
              <Ionicons
                name={categoryIcon(item.category.slug)}
                size={60}
                color="rgba(255,255,255,0.5)"
              />
            }
          />
          <View
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: accent,
              borderRadius: 8,
              paddingHorizontal: 9,
              paddingVertical: 5,
            }}
          >
            <Ionicons name={isHave ? 'pricetag' : 'search'} size={11} color="#FFFFFF" />
            <Text style={{ fontFamily: BOLD, fontSize: 11, letterSpacing: 0.5, color: '#FFFFFF' }}>
              {isHave ? 'HAVE' : 'WANTS'}
            </Text>
          </View>
        </View>
        <View style={{ padding: 12, paddingTop: 11 }}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: TITLE,
              fontSize: 18,
              lineHeight: 20,
              letterSpacing: -0.6,
              color: M.ink,
              minHeight: 40,
            }}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: REG, fontSize: 12.5, color: M.secondary, marginTop: 6 }}
          >
            {item.category.name} · {timeAgo(item.createdAt)}
          </Text>
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontFamily: BOLD, fontSize: 12.5, color: accent, flexShrink: 1 }}
            >
              {price != null ? formatMoney(price, item.pricing!.priceCurrency) : 'Barter only'}
            </Text>
            <TradeButton accent={accent} compact={width < 200} />
          </View>
        </View>
      </Press>
      <View style={{ position: 'absolute', top: 8, right: 8 }}>
        <SaveHeart size={32} />
      </View>
    </View>
  );
}

/* --------------------------- results + sort controls ------------------------- */

export type SortKey = 'newest' | 'oldest' | 'title';
const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title A–Z',
};

export function ResultsRow({
  count,
  sort,
  open,
  onToggle,
  onPick,
  trailing,
}: {
  count: number;
  sort: SortKey;
  open: boolean;
  onToggle: () => void;
  onPick: (k: SortKey) => void;
  trailing?: ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: GUTTER, marginTop: 16, zIndex: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontFamily: SEMI, fontSize: 13.5, color: M.secondary }}>
            {count} {count === 1 ? 'result' : 'results'}
          </Text>
          {trailing}
        </View>
        <Press
          haptic="selection"
          scale="md"
          accessibilityRole="button"
          accessibilityLabel={`Sort by, ${SORT_LABEL[sort]}`}
          onPress={onToggle}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontFamily: SEMI, fontSize: 13.5, color: M.secondary }}>
            {open ? 'Sort by' : sort === 'newest' ? 'Sort by' : SORT_LABEL[sort]}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={M.secondary} />
        </Press>
      </View>
      {open ? (
        <View
          style={{
            marginTop: 8,
            alignSelf: 'flex-end',
            backgroundColor: M.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: M.border,
            overflow: 'hidden',
          }}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <Press
              key={k}
              haptic="selection"
              scale="none"
              accessibilityRole="button"
              accessibilityState={{ selected: k === sort }}
              onPress={() => onPick(k)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 11,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Text style={{ fontFamily: k === sort ? BOLD : SEMI, fontSize: 14, color: M.ink }}>
                {SORT_LABEL[k]}
              </Text>
              {k === sort ? <Ionicons name="checkmark" size={16} color={M.red} /> : null}
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}
