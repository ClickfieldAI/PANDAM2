import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import {
  Avatar,
  Notice,
  Press,
  Rail,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  useThemeColors,
} from '@pandam/ui';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import { IntentSwitch } from '@/components/brand/IntentSwitch';
import { CategoryGrid } from '@/components/CategoryFilter';
import { ItemCard } from '@/components/ItemCard';
import { MatchCard } from '@/components/MatchCard';
import { ErrorState } from '@/components/states';
import {
  demoMatches,
  demoMyListings,
  demoMyNeeds,
  demoOthersListings,
  demoMergeList,
  demoMergePages,
  demoPages,
  demoQuery,
} from '@/dummy';
import { mediaSrc } from '@/lib/api/media';
import { useSession } from '@/lib/auth/hooks';
import { useBrowseCategories } from '@/lib/hooks/useCategories';
import { useDiscover, useMyItems, useRecommendations } from '@/lib/hooks/useMarket';
import { useMatches } from '@/lib/hooks/useMatches';
import { TourTarget } from '@/lib/tour/TourTarget';

/** Swiss editorial palette — exact spec values, deliberately tiny. */
const ORANGE = '#FF3B20';
/** Page margin on the 8pt spacing scale. */
const G = 20;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Section header: a small bold overline number, a large bold title, an optional link. */
function SectionTitle({
  number,
  title,
  actionLabel,
  onAction,
}: {
  number: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useThemeColors();
  const MUTED = colors.textMuted;
  const INK = colors.textPrimary;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: 'InterTight_700Bold',
            fontSize: 12.5,
            letterSpacing: 1,
            color: MUTED,
          }}
        >
          {number}
        </Text>
        <Text
          style={{
            fontFamily: 'InterTight_700Bold',
            fontSize: 22,
            lineHeight: 26,
            letterSpacing: -0.6,
            color: INK,
          }}
        >
          {title}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Press
          scale="sm"
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 4 }}
        >
          <Text style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 13.5, color: INK }}>
            {actionLabel}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={INK} />
        </Press>
      ) : null}
    </View>
  );
}

/** Compact counter on the strip under the feed. */
function StatChip({
  value,
  label,
  onPress,
}: {
  value: number;
  label: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const INK = colors.textPrimary;
  const MUTED = colors.textMuted;

  return (
    <Press
      scale="sm"
      dim={false}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 }}
    >
      <Text
        style={{
          fontFamily: 'InterTight_800ExtraBold',
          fontSize: 28,
          lineHeight: 32,
          letterSpacing: -1,
          color: INK,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: 'InterTight_600SemiBold',
          fontSize: 10,
          letterSpacing: 1.2,
          color: MUTED,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Press>
  );
}

/* -------------------------------------------------------------------------- */

export default function HomeScreen() {
  const colors = useThemeColors();
  const BG = colors.background;
  const MUTED = colors.textMuted;
  const INK = colors.textPrimary;

  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const { profile } = useSession();
  const name = profile?.displayName?.split(' ')[0] ?? 'there';

  const categories = useBrowseCategories();
  const [addingCategory, setAddingCategory] = useState(false);
  const matches = demoQuery(useMatches(), demoMatches);
  // "Fresh near you" is a RECENCY window, not just the first page of Discover
  // (which has no age limit at all) — only listings published in the last 3
  // days show here, newest first. Older-but-still-available listings remain
  // fully visible in Discover.
  const FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const [freshSince] = useState(() => Date.now() - FRESH_WINDOW_MS);
  const recent = demoMergePages(
    useDiscover('listing', { limit: 8, since: freshSince }),
    demoPages(demoOthersListings),
  );
  const myHave = demoMergeList(useMyItems('listing'), demoMyListings);
  const myNeed = demoMergeList(useMyItems('need'), demoMyNeeds);
  // Behavior-Based Recommendation Engine (see apps/worker/src/domain/
  // recommendations.ts) — deterministic, rule-based, no AI. No demo-data
  // fallback needed: the engine's own cold-start path already guarantees a
  // non-empty, non-personalized list for a brand-new user.
  const recommended = useRecommendations(8);

  const goDiscover = useCallback(
    (categoryId?: string) =>
      router.push(
        categoryId ? `/(app)/(tabs)/discover?category=${categoryId}` : '/(app)/(tabs)/discover',
      ),
    [router],
  );

  const recentItems = recent.data?.pages.flatMap((p) => p.items) ?? [];
  const activeHave = myHave.data?.filter((i) => i.status === 'published').length ?? 0;
  const activeNeed = myNeed.data?.filter((i) => i.status === 'published').length ?? 0;
  const matchCount = matches.data?.length ?? 0;
  const hasNothingListed = activeHave === 0 && activeNeed === 0;
  const maxW = wide ? 1080 : layout.contentMaxWidth;

  return (
    <Screen
      scroll
      padded={false}
      background={BG}
      contentStyle={{ maxWidth: '100%' }}
      edges={['top']}
      tabBarInset
      onRefresh={() =>
        void Promise.all([matches.refetch(), recent.refetch(), myHave.refetch(), myNeed.refetch()])
      }
      refreshing={matches.isRefetching}
    >
      <View
        style={{
          width: '100%',
          maxWidth: maxW,
          alignSelf: 'center',
          paddingHorizontal: G,
          paddingTop: 8,
        }}
      >
        <Stack gap="md">
          {/* --------------------------------------------------- header -- */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <Text
                style={{
                  fontFamily: 'InterTight_600SemiBold',
                  fontSize: 12,
                  letterSpacing: 1.6,
                  color: MUTED,
                  textTransform: 'uppercase',
                }}
              >
                {greeting()},
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={{
                  fontFamily: 'InterTight_900Black',
                  fontSize: 44,
                  lineHeight: 48,
                  letterSpacing: -1.6,
                  color: INK,
                  textTransform: 'uppercase',
                }}
              >
                {name}
              </Text>
            </View>
            <Press
              scale="sm"
              accessibilityRole="button"
              accessibilityLabel="Your profile"
              onPress={() => router.push('/(app)/(tabs)/profile')}
              style={{ borderRadius: 24, marginTop: 2 }}
            >
              <Avatar
                name={profile?.displayName ?? 'You'}
                size={44}
                uri={mediaSrc(profile?.avatarUrl)}
              />
            </Press>
          </View>

          {/* --------------------------------------------------- search -- */}
          <TourTarget id="home-search">
            <Press
              scale="sm"
              accessibilityRole="button"
              accessibilityLabel="Search what people are offering"
              onPress={() => goDiscover()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.borderSoft,
                borderRadius: 16,
                paddingHorizontal: 16,
                height: 50,
              }}
            >
              <Ionicons name="search" size={18} color={MUTED} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: 'InterTight_400Regular',
                  fontSize: 14.5,
                  color: MUTED,
                }}
                numberOfLines={1}
              >
                Search cameras, skills, furniture…
              </Text>
              <Ionicons name="options-outline" size={18} color={INK} />
            </Press>
          </TourTarget>

          {/* ------------------------------------------- I HAVE / I NEED -- */}
          <TourTarget id="home-intent">
            <IntentSwitch
              haveCount={activeHave}
              needCount={activeNeed}
              onHave={() => router.push('/(app)/new-listing')}
              onNeed={() => router.push('/(app)/new-need')}
            />
          </TourTarget>

          {/* -------------------------------------------------- matches -- */}
          <Press
            scale="sm"
            accessibilityRole="button"
            accessibilityLabel={`${matchCount} matches`}
            onPress={() => router.push('/(app)/(tabs)/matches')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: ORANGE,
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 14,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                backgroundColor: ORANGE,
                borderRadius: 11,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="git-compare" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 15, color: INK }}>
                {matchCount > 0
                  ? `${matchCount} barter match${matchCount === 1 ? '' : 'es'}`
                  : 'No matches yet'}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: 'InterTight_400Regular', fontSize: 12.5, color: MUTED }}
              >
                {matchCount > 0 ? 'Someone wants what you have' : 'List items to find your mirror'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ORANGE} />
          </Press>
        </Stack>
      </View>

      {/* ------------------------------------------------------ sections -- */}
      <View
        style={{
          width: '100%',
          maxWidth: maxW,
          alignSelf: 'center',
          paddingHorizontal: G,
          paddingTop: 20,
        }}
      >
        <Stack gap="2xl">
          {/* ----------------------------------------------- categories -- */}
          {categories.data && categories.data.length > 0 ? (
            <View>
              <SectionTitle
                number="03"
                title="Browse by category"
                actionLabel="All"
                onAction={() => goDiscover()}
              />
              <CategoryGrid
                categories={categories.data}
                limit={8}
                onSelect={(id) => goDiscover(id)}
                onAdd={() => setAddingCategory(true)}
              />
            </View>
          ) : null}

          {/* -------------------------------------------------- matches -- */}
          {matchCount > 0 ? (
            <View>
              <SectionTitle
                number="RECIPROCAL"
                title="Your barter matches"
                actionLabel="See all"
                onAction={() => router.push('/(app)/(tabs)/matches')}
              />
              {matches.isPending ? (
                <SkeletonList count={1} />
              ) : matches.isError ? (
                <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
              ) : (
                <Stack gap="md">
                  {matches.data!.slice(0, 2).map((m) => (
                    <MatchCard
                      key={m.key}
                      match={m}
                      onPress={() => router.push('/(app)/(tabs)/matches')}
                    />
                  ))}
                </Stack>
              )}
            </View>
          ) : null}

          {/* --------------------------------------------------- recent -- */}
          <View>
            <SectionTitle
              number="04"
              title="Fresh near you"
              actionLabel="See all"
              onAction={() => goDiscover()}
            />
            {recent.isPending ? (
              <SkeletonList count={2} />
            ) : recent.isError ? (
              <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
            ) : recentItems.length === 0 ? (
              <Notice
                kind="neutral"
                icon={<Ionicons name="cube-outline" size={16} color={colors.textMuted} />}
              >
                Nothing has been published yet. Be the first to list something you have.
              </Notice>
            ) : (
              <Rail>
                {recentItems.slice(0, 8).map((it) => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    variant="rail"
                    onPress={() => router.push(`/(app)/listing/${it.id}`)}
                  />
                ))}
              </Rail>
            )}
          </View>

          {/* ------------------------------------------- recommended ----- */}
          {recommended.isPending || (recommended.data?.items.length ?? 0) > 0 ? (
            <View>
              <SectionTitle number="05" title="Recommended for you" />
              {recommended.isPending ? (
                <SkeletonList count={2} />
              ) : recommended.isError ? (
                <ErrorState error={recommended.error} onRetry={() => void recommended.refetch()} />
              ) : (
                <Rail>
                  {(recommended.data?.items ?? []).map((it) => (
                    <ItemCard
                      key={it.id}
                      item={it}
                      variant="rail"
                      onPress={() => router.push(`/(app)/listing/${it.id}`)}
                    />
                  ))}
                </Rail>
              )}
            </View>
          ) : null}

          {/* ------------------------------------------- match counters -- */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderRadius: 16,
            }}
          >
            <StatChip
              value={activeHave}
              label="listed"
              onPress={() => router.push('/(app)/(tabs)/profile')}
            />
            <View style={{ width: 1, backgroundColor: colors.surfaceMuted }} />
            <StatChip
              value={activeNeed}
              label="wanted"
              onPress={() => router.push('/(app)/(tabs)/profile')}
            />
            <View style={{ width: 1, backgroundColor: colors.surfaceMuted }} />
            <StatChip
              value={matchCount}
              label="matches"
              onPress={() => router.push('/(app)/(tabs)/matches')}
            />
          </View>

          {/* --------------------------------------------- how it works -- */}
          {hasNothingListed ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.borderSoft,
                borderRadius: 16,
                padding: 16,
                gap: 8,
                backgroundColor: colors.surface,
              }}
            >
              <Text
                style={{
                  fontFamily: 'InterTight_700Bold',
                  fontSize: 11,
                  letterSpacing: 1.6,
                  color: INK,
                  textTransform: 'uppercase',
                }}
              >
                How barter works here
              </Text>
              <Text
                style={{
                  fontFamily: 'InterTight_400Regular',
                  fontSize: 14,
                  lineHeight: 21,
                  color: MUTED,
                }}
              >
                You have{' '}
                <Text style={{ fontFamily: 'InterTight_700Bold', color: ORANGE }}>web design</Text>{' '}
                and need{' '}
                <Text style={{ fontFamily: 'InterTight_700Bold', color: INK }}>photography</Text>.
                Someone else has photography and needs web design. PANDAM spots the mirror — no
                money changes hands.
              </Text>
            </View>
          ) : null}
        </Stack>
      </View>
      <AddCategorySheet
        visible={addingCategory}
        onClose={() => setAddingCategory(false)}
        existing={categories.data ?? []}
        onCreated={(c) => goDiscover(c.id)}
        onUseExisting={(id) => goDiscover(id)}
      />
    </Screen>
  );
}
