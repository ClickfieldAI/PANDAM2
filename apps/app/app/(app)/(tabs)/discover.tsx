import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, View, useWindowDimensions } from 'react-native';

import {
  Chip,
  EmptyState,
  Row,
  Screen,
  SkeletonGrid,
  Text,
  layout,
  radii,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { AddCategorySheet } from '@/components/AddCategorySheet';
import {
  CategoryTiles,
  DiscoverDecor,
  DiscoverHeader,
  FeatureCard,
  GRID_GAP,
  GUTTER,
  GridCard,
  ResultsRow,
  type SortKey,
} from '@/components/discover/DiscoverUI';
import { ErrorState } from '@/components/states';
import { demoCities, demoDiscover, demoMergePages, demoQuery } from '@/dummy';
import { type MarketKind } from '@/lib/api/market';
import { useSession } from '@/lib/auth/hooks';
import { useBrowseCategories } from '@/lib/hooks/useCategories';
import { useDebounced } from '@/lib/hooks/useDebounced';
import { useDiscover, useListingCities } from '@/lib/hooks/useMarket';

export default function DiscoverScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; owner?: string; city?: string }>();
  const [kind, setKind] = useState<MarketKind>('listing');
  const [rawQuery, setRawQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(params.category ?? null);
  const [city, setCity] = useState<string | null>(params.city ?? null);
  const [showFilters, setShowFilters] = useState(!!params.city);
  const [sort, setSort] = useState<SortKey>('newest');
  const [sortOpen, setSortOpen] = useState(false);
  const q = useDebounced(rawQuery.trim(), 350);

  const categories = useBrowseCategories();
  const [addingCategory, setAddingCategory] = useState(false);
  const cities = demoQuery(useListingCities(), demoCities() as never);
  const filters = useMemo(
    () => ({
      category: categoryId ?? undefined,
      q: q || undefined,
      owner: params.owner || undefined,
      city: city ?? undefined,
      limit: 12,
    }),
    [categoryId, q, params.owner, city],
  );
  const discover = demoMergePages(useDiscover(kind, filters), demoDiscover(kind, filters));
  const { user: me } = useSession();
  // Discover is for OTHER people's items — your own listing or request is not
  // an opportunity for you (it lives on your Profile instead).
  const unsorted = (discover.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (i) => i.ownerId !== me?.id,
  );
  // The API returns newest first; the sort control reorders what is loaded.
  const items =
    sort === 'oldest'
      ? [...unsorted].sort((x, y) => x.createdAt - y.createdAt)
      : sort === 'title'
        ? [...unsorted].sort((x, y) => x.title.localeCompare(y.title))
        : unsorted;
  // Marketplace rhythm: the freshest item leads as a large feature card.
  const featured = items.length > 3 ? items[0] : null;
  const gridItems = featured ? items.slice(1) : items;

  /*
   * Column count follows the WIDTH, not the platform. Two columns inside a
   * 720pt reading column gives 340pt cards, which on a laptop are absurdly
   * large for a thumbnail and a two-line title. Three is the right density
   * once there is room for it — the grid gets denser on a bigger screen
   * rather than just wider.
   */
  const { width } = useWindowDimensions();
  const columns = width >= 620 ? 3 : 2;
  const rail = Math.min(width, 720);
  const cardW = Math.floor((rail - GUTTER * 2 - GRID_GAP * (columns - 1)) / columns);

  const isHave = kind === 'listing';
  const tone = isHave ? 'accent' : 'need';
  const activeFilters = [!!q, !!categoryId, !!city].filter(Boolean).length;
  const clearFilters = () => {
    setRawQuery('');
    setCategoryId(null);
    setCity(null);
  };

  const needColor = colors.need;
  const openItem = (id: string) =>
    router.push(isHave ? `/(app)/listing/${id}` : `/(app)/need/${id}`);

  const scrollingHeader = (
    <View style={{ paddingBottom: spacing.sm }}>
      <DiscoverDecor />
      <DiscoverHeader
        isHave={isHave}
        needColor={needColor}
        query={rawQuery}
        onQuery={setRawQuery}
        filterActive={showFilters || !!city}
        onFilter={() => setShowFilters((v) => !v)}
        onKind={(have) => setKind(have ? 'listing' : 'need')}
      />
      {categories.data ? (
        <CategoryTiles
          categories={categories.data}
          selectedId={categoryId}
          onSelect={setCategoryId}
          onAdd={() => setAddingCategory(true)}
          accent={tone === 'need' ? needColor : '#FF3B2F'}
        />
      ) : (
        <Row gap="sm" style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={{
                width: 56,
                height: 56,
                borderRadius: radii.lg,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          ))}
        </Row>
      )}

      {/* Where something is matters as much as what it is: the filter button reveals cities. */}
      {showFilters && cities.data && cities.data.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6 }}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: GUTTER }}
        >
          <Chip
            label="Anywhere"
            icon={<Ionicons name="earth-outline" size={13} color={colors.textMuted} />}
            selected={!city}
            tone={tone}
            onPress={() => setCity(null)}
          />
          {cities.data.map((c) => (
            <Chip
              key={c.city}
              label={c.city}
              count={c.count}
              icon={
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={city === c.city ? colors.textInverse : colors.textMuted}
                />
              }
              selected={city === c.city}
              tone={tone}
              onPress={() => setCity(city === c.city ? null : c.city)}
            />
          ))}
        </ScrollView>
      ) : null}

      {featured ? (
        <FeatureCard item={featured} needColor={needColor} onPress={() => openItem(featured.id)} />
      ) : null}

      {items.length > 0 ? (
        <ResultsRow
          count={items.length}
          sort={sort}
          open={sortOpen}
          onToggle={() => setSortOpen((v) => !v)}
          onPick={(k) => {
            setSort(k);
            setSortOpen(false);
          }}
          trailing={
            activeFilters > 0 ? (
              <Text variant="label" tone={tone} onPress={clearFilters}>
                Clear
              </Text>
            ) : null
          }
        />
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={gridItems}
        key={`${kind}-${columns}`}
        keyExtractor={(it) => it.id}
        numColumns={columns}
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GUTTER }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingBottom: layout.tabBarInset,
          gap: GRID_GAP,
          flexGrow: 1,
        }}
        ListHeaderComponent={scrollingHeader}
        renderItem={({ item }) => (
          <GridCard
            item={item}
            needColor={needColor}
            width={cardW}
            onPress={() => openItem(item.id)}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (discover.hasNextPage && !discover.isFetchingNextPage) void discover.fetchNextPage();
        }}
        ListEmptyComponent={
          discover.isPending ? (
            <SkeletonGrid count={6} />
          ) : discover.isError ? (
            <ErrorState error={discover.error} onRetry={() => void discover.refetch()} />
          ) : (
            <EmptyState
              tone={tone}
              icon={
                <Ionicons
                  name={
                    activeFilters > 0
                      ? 'search-outline'
                      : isHave
                        ? 'cube-outline'
                        : 'hand-left-outline'
                  }
                  size={24}
                  color={isHave ? colors.accent : colors.need}
                />
              }
              title={activeFilters > 0 ? 'Nothing matches those filters' : 'Nothing here yet'}
              body={
                activeFilters > 0
                  ? 'Try a broader search, another category, or widen the location.'
                  : `No one has published something they ${isHave ? 'have' : 'need'} yet. Be the first.`
              }
              actionLabel={
                activeFilters > 0
                  ? 'Clear filters'
                  : isHave
                    ? 'Add what you have'
                    : 'Add what you need'
              }
              actionVariant={isHave ? 'primary' : 'need'}
              onAction={
                activeFilters > 0
                  ? clearFilters
                  : () => router.push(isHave ? '/(app)/new-listing' : '/(app)/new-need')
              }
            />
          )
        }
        ListFooterComponent={
          discover.isFetchingNextPage ? (
            <View style={{ paddingTop: spacing.md }}>
              <SkeletonGrid count={2} />
            </View>
          ) : items.length > 0 && !discover.hasNextPage ? (
            <Row justify="center" gap="xs" style={{ paddingVertical: spacing['2xl'] }}>
              <Text variant="caption" tone="faint">
                That is everything
              </Text>
            </Row>
          ) : null
        }
      />
      <AddCategorySheet
        visible={addingCategory}
        onClose={() => setAddingCategory(false)}
        existing={categories.data ?? []}
        onCreated={(c) => setCategoryId(c.id)}
        onUseExisting={(id) => setCategoryId(id)}
      />
    </Screen>
  );
}
