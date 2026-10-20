/**
 * Visual layer for Profile and Edit Profile, built to the supplied references.
 * Presentation only — data, navigation and mutations stay in the screens.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode } from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { type MarketItem } from '@pandam/types';
import { CoverTile, Press } from '@pandam/ui';

import { TourTarget } from '@/lib/tour/TourTarget';

import { ListingHeart } from '@/components/brand/ListingHeart';
import { useM, RedBlob } from '@/components/matches/MatchesUI';
import { primaryImage } from '@/lib/api/media';
import { formatMoney, timeAgo } from '@/lib/format';
import { categoryIcon } from '@/lib/icons';
import { useThemeColors } from '@pandam/ui';

export const GUTTER = 20;
const TITLE = 'InterTight_900Black';
const HEAD = 'InterTight_800ExtraBold';
const BOLD = 'InterTight_700Bold';
const SEMI = 'InterTight_600SemiBold';
const REG = 'InterTight_400Regular';
const GREEN = '#22C55E';
const concrete = require('../../../assets/matches/concrete.webp') as number;

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------- decoration -------------------------------- */

export function AccentLines({ size = 50, style }: { size?: number; style?: object }) {
  const M = useM();

  return (
    <View pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M14,10 L4,50 M42,52 L90,16 M56,82 L98,84"
          stroke={M.ink}
          strokeWidth={5.5}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

/**
 * One layered composition: the red organic shape is rendered FIRST (zIndex 1) and
 * the concrete stone AFTER it (zIndex 2), so the stone visibly overlaps the red
 * shape instead of sitting beside it. `Stone` is a transparent cut-out, which is
 * what lets the red show around its edges.
 */
function Stone({ size, rotate, style }: { size: number; rotate: number; style: object }) {
  return (
    <Image
      source={concrete}
      resizeMode="contain"
      style={[
        {
          position: 'absolute',
          zIndex: 2,
          width: size,
          height: size * 0.89,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    />
  );
}

/** Top-right corner: red shape behind, stone in front overlapping it. */
export function CornerDecor({ height = 230 }: { height?: number }) {
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
        height,
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <View style={{ position: 'absolute', zIndex: 1, top: -14, right: w * 0.1 }}>
        <RedBlob width={160} height={140} />
      </View>
      <Stone size={250} rotate={26} style={{ top: -2, right: -112 }} />
    </View>
  );
}

/** A concrete stone at the END of the page (bottom-right). */
export function EndDecor() {
  return (
    <View pointerEvents="none" style={{ height: 190, overflow: 'hidden', marginTop: 10 }}>
      <Stone size={250} rotate={-8} style={{ right: -92, top: 0 }} />
    </View>
  );
}

/* --------------------------------- headings -------------------------------- */

export function BigHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text
              style={{
                fontFamily: BOLD,
                fontSize: 19,
                lineHeight: 24,
                color: M.red,
                letterSpacing: 0.5,
              }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={{
              fontFamily: TITLE,
              fontSize: 53,
              lineHeight: 56,
              letterSpacing: -2.6,
              color: M.ink,
            }}
          >
            {title}
          </Text>
        </View>
        {right}
      </View>
      <Text
        style={{
          fontFamily: REG,
          fontSize: 14.5,
          lineHeight: 20,
          color: colors.textSecondary,
          marginTop: 2,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

export function SectionTitle({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: GUTTER,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text
          style={{
            fontFamily: HEAD,
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -1.1,
            color: M.ink,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ fontFamily: REG, fontSize: 14, color: colors.textSecondary, marginTop: 1 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Press
          haptic="light"
          scale="md"
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel} ${title}`}
          onPress={onAction}
          hitSlop={10}
          style={{ paddingTop: 8 }}
        >
          <Text style={{ fontFamily: BOLD, fontSize: 16, color: M.red }}>{actionLabel}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/* ------------------------------ profile card -------------------------------- */

export function SettingsButton({ onPress }: { onPress: () => void }) {
  const M = useM();

  return (
    <TourTarget id="profile-settings" style={{ marginTop: 34 }}>
      <Press
        haptic="light"
        scale="lg"
        accessibilityLabel="Account settings"
        onPress={onPress}
        hitSlop={6}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: M.surface,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }}
      >
        <Ionicons name="settings" size={23} color={M.ink} />
      </Press>
    </TourTarget>
  );
}

/** Pale-pink ring around the avatar, as in the reference. */
export function AvatarRing({ children, size }: { children: ReactNode; size: number }) {
  const M = useM();

  return (
    <View
      style={{
        width: size + 10,
        height: size + 10,
        borderRadius: (size + 10) / 2,
        borderWidth: 2,
        borderColor: M.pink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export function OutlinedButton({
  label,
  onPress,
  compact,
}: {
  label: string;
  onPress: () => void;
  compact?: boolean;
}) {
  const M = useM();

  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        height: compact ? 36 : 40,
        paddingHorizontal: 22,
        borderRadius: 7,
        borderWidth: 1.4,
        borderColor: M.line,
        backgroundColor: M.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: SEMI, fontSize: 15, color: M.ink }}>{label}</Text>
    </Press>
  );
}

export function StatTiles({ stats }: { stats: { n: number; label: string; red?: boolean }[] }) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {stats.map((s) => (
        <View
          key={s.label}
          style={{
            flex: 1,
            height: 68,
            borderRadius: 9,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
          }}
        >
          <Text
            style={{ fontFamily: HEAD, fontSize: 26, lineHeight: 30, color: s.red ? M.red : M.ink }}
          >
            {s.n}
          </Text>
          <Text style={{ fontFamily: REG, fontSize: 13, color: colors.textSecondary }}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------- listing card -------------------------------- */

function Tag({
  label,
  tone,
  dot,
}: {
  label: string;
  tone: 'pink' | 'green' | 'gray';
  dot?: boolean;
}) {
  const M = useM();
  const colors = useThemeColors();

  const bg = tone === 'pink' ? M.pink : tone === 'green' ? colors.successSoft : M.track;
  const fg =
    tone === 'pink' ? colors.accentText : tone === 'green' ? colors.successText : M.secondary;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 14,
        backgroundColor: bg,
        paddingHorizontal: 10,
        height: 26,
      }}
    >
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
      ) : null}
      <Text style={{ fontFamily: SEMI, fontSize: 12.5, color: fg }}>{label}</Text>
    </View>
  );
}

const STATUS: Record<string, { label: string; tone: 'green' | 'gray' | 'pink' }> = {
  published: { label: 'Active', tone: 'green' },
  draft: { label: 'Draft', tone: 'gray' },
  paused: { label: 'Paused', tone: 'gray' },
  archived: { label: 'Archived', tone: 'gray' },
  traded: { label: 'Traded', tone: 'pink' },
};

/** The compact card used on the profile (about half a screen wide). */
export function ProfileItemCard({
  item,
  width,
  onPress,
}: {
  item: MarketItem;
  width: number;
  onPress: () => void;
}) {
  const M = useM();

  const colors = useThemeColors();

  const isHave = item.kind === 'listing';
  const price = item.pricing?.priceAmount;
  const status = STATUS[item.status] ?? { label: item.status, tone: 'gray' as const };
  const imgH = Math.round(width * 0.76);
  return (
    <View style={{ width }}>
      <Press
        haptic="light"
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${isHave ? 'Have' : 'Need'}: ${item.title}`}
        onPress={onPress}
        style={{
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1.4,
          borderColor: M.line,
          backgroundColor: M.surface,
        }}
      >
        <View style={{ height: imgH, backgroundColor: colors.surfaceMuted }}>
          <CoverTile
            seed={item.id}
            height={imgH}
            radius="none"
            uri={primaryImage(item.images)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%' }}
            icon={
              <Ionicons
                name={categoryIcon(item.category.slug)}
                size={56}
                color="rgba(255,255,255,0.5)"
              />
            }
          />
          <View
            style={{
              position: 'absolute',
              top: 9,
              left: 9,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: isHave ? M.red : M.inkFill,
              borderRadius: 6,
              paddingHorizontal: 9,
              paddingVertical: 5,
            }}
          >
            <Ionicons name={isHave ? 'pricetag' : 'search'} size={12} color="#fff" />
            <Text style={{ fontFamily: BOLD, fontSize: 12, letterSpacing: 0.4, color: '#fff' }}>
              {isHave ? 'HAVE' : 'WANTS'}
            </Text>
          </View>
        </View>
        <View style={{ padding: 12, gap: 6 }}>
          <Text
            numberOfLines={2}
            style={{ fontFamily: BOLD, fontSize: 19, lineHeight: 22, color: M.ink }}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: REG, fontSize: 13, color: colors.textMuted }}
          >
            {item.category.name} · {timeAgo(item.createdAt)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <Tag
              label={
                price != null ? formatMoney(price, item.pricing!.priceCurrency) : 'Barter only'
              }
              tone="pink"
            />
            <Tag label={status.label} tone={status.tone} dot={status.label === 'Active'} />
          </View>
        </View>
      </Press>
      <View style={{ position: 'absolute', top: 7, right: 7 }}>
        <ListingHeart item={item} size={32} />
      </View>
    </View>
  );
}

/* ------------------------------ empty states -------------------------------- */

export function EmptyNeed({
  title,
  body,
  actionLabel,
  onAction,
  icon = 'search',
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  icon?: IconName;
}) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: GUTTER, marginTop: 6 }}>
      <View style={{ width: 300, height: 170, alignItems: 'center' }}>
        <View style={{ position: 'absolute', left: 8, top: 4 }}>
          <Svg width={284} height={160} viewBox="0 0 300 170" preserveAspectRatio="none">
            <Path
              d="M52,28 C96,-8 188,-6 238,24 C290,56 304,118 262,150 C220,180 130,176 74,158 C24,140 -8,88 12,56 C20,42 34,36 52,28 Z"
              fill={M.pink}
            />
          </Svg>
        </View>
        <View
          style={{
            marginTop: 26,
            width: 96,
            height: 96,
            borderRadius: 22,
            backgroundColor: colors.surfaceMuted,
            borderWidth: 1.6,
            borderColor: M.line,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 10,
            shadowOffset: { width: 4, height: 6 },
            elevation: 5,
          }}
        >
          <Ionicons name={icon} size={46} color={M.ink} />
        </View>
        <AccentLines size={44} style={{ right: 22, top: 4 }} />
      </View>
      <Text
        style={{ fontFamily: HEAD, fontSize: 24, color: M.ink, marginTop: 4, letterSpacing: -0.6 }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: REG,
          fontSize: 14.5,
          color: colors.textSecondary,
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        {body}
      </Text>
      {/* This one is deliberately black, as in the reference — not the red primary. */}
      <Press
        haptic="light"
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={onAction}
        style={{
          marginTop: 14,
          height: 46,
          borderRadius: 8,
          backgroundColor: colors.need,
          paddingHorizontal: 26,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Text style={{ fontFamily: SEMI, fontSize: 16, color: '#fff' }}>{actionLabel}</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </Press>
    </View>
  );
}

/* --------------------------------- panels ---------------------------------- */

export function Panel({ children }: { children: ReactNode }) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View
      style={{
        marginHorizontal: GUTTER,
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 1.4,
        borderColor: M.line,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  tone = 'red',
  last,
  chevron = true,
  badge,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone?: 'red' | 'neutral';
  last?: boolean;
  chevron?: boolean;
  badge?: number;
}) {
  const M = useM();

  const colors = useThemeColors();

  const red = tone === 'red';
  return (
    <Press
      haptic="light"
      scale="none"
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      states={{ pressed: { backgroundColor: colors.surfaceMuted } }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.borderSoft,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          borderWidth: 1.3,
          borderColor: red ? M.red : M.ink,
          backgroundColor: red ? M.pink : M.track,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={21} color={red ? M.red : M.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: BOLD,
            fontSize: 16.5,
            color: red && title === 'Sign out' ? M.red : M.ink,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: REG, fontSize: 13, color: colors.textSecondary, marginTop: 1 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: M.red,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 6,
          }}
        >
          <Text style={{ fontFamily: BOLD, fontSize: 12, color: '#fff' }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
    </Press>
  );
}

/* --------------------------------- edit form -------------------------------- */

export function FieldLabel({ children }: { children: string }) {
  const M = useM();

  return (
    <Text style={{ fontFamily: BOLD, fontSize: 16, color: M.ink, marginBottom: 6 }}>
      {children}
    </Text>
  );
}
