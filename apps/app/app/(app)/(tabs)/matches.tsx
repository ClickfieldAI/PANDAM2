import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, View } from 'react-native';

import { type OfferView } from '@pandam/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CoverTile,
  GroupedList,
  ListRow,
  Notice,
  Press,
  Reveal,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  spacing,
  useToast,
  haptic,
  useThemeColors,
} from '@pandam/ui';

import {
  EmptyShell,
  FilterChips,
  MatchesDecor,
  MatchesHeader,
  MirrorsArt,
  PrimaryCta,
  ReceivedArt,
  SecondaryLink,
  SentArt,
} from '@/components/matches/MatchesUI';
import { MatchCard } from '@/components/MatchCard';
import { ErrorState } from '@/components/states';
import { demoMatches, demoMergeList, demoOffers, demoQuery } from '@/dummy';
import { ApiError } from '@/lib/api/client';
import { mediaSrc, primaryImage } from '@/lib/api/media';
import { categoryIcon } from '@/lib/icons';
import { type MarketKind } from '@/lib/api/market';
import { useItem } from '@/lib/hooks/useMarket';
import { useIncomingOffers, useOutgoingOffers, useRespondToOffer } from '@/lib/hooks/useOffers';
import { useMatches } from '@/lib/hooks/useMatches';

const STATUS_KIND: Record<OfferView['status'], 'neutral' | 'success' | 'danger' | 'warning'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

/** Sentence-case labels; the API's lowercase enum is not user-facing copy. */
const STATUS_LABEL: Record<OfferView['status'], string> = {
  pending: 'Awaiting reply',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
  expired: 'Expired',
};

type IncomingFilter = 'all' | 'pending' | 'accepted' | 'rejected';

const INCOMING_FILTER_LABEL: Record<IncomingFilter, string> = {
  all: 'All',
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
};

type Tab = 'reciprocal' | 'received' | 'sent';

const EMPTY_GROUPS: ListingGroup[] = [];

interface ListingGroup {
  kind: MarketKind;
  itemId: string;
  title: string;
  offers: OfferView[];
}

/** Incoming offers, bucketed by the listing/need they're against (`requested`
 *  — on an incoming offer that is always one of MY items, never theirs). */
function groupIncomingByListing(offers: OfferView[]): ListingGroup[] {
  const order: string[] = [];
  const byItem = new Map<string, ListingGroup>();
  for (const offer of offers) {
    const itemId = offer.requested.id;
    let group = byItem.get(itemId);
    if (!group) {
      group = {
        kind: offer.requestedKind === 'need' ? 'need' : 'listing',
        itemId,
        title: offer.requested.title,
        offers: [],
      };
      byItem.set(itemId, group);
      order.push(itemId);
    }
    group.offers.push(offer);
  }
  return order.map((id) => byItem.get(id)!);
}

/**
 * One of YOUR listings/needs, with its real view/interested counts (fetched
 * from the same `GET /:id` the item detail screen uses — view count is never
 * invented here) and every person interested in it underneath, each with a
 * real Accept/Reject acting on that exact offer via the existing offers API.
 */
function ReceivedListingGroup({ group }: { group: ListingGroup }) {
  const colors = useThemeColors();

  const router = useRouter();
  const toast = useToast();
  const item = useItem(group.kind, group.itemId);
  const respond = useRespondToOffer();

  const interestedCount = group.offers.filter(
    (o) => o.status === 'pending' || o.status === 'accepted',
  ).length;
  const viewCount = item.data?.viewCount ?? 0;
  const title = item.data?.title ?? group.title;
  const thumbUri = item.data?.images ? primaryImage(item.data.images) : undefined;

  const doAccept = (offer: OfferView) =>
    respond.mutate(
      { id: offer.id, action: 'accept' },
      {
        onSuccess: () =>
          toast.success(`Accepted ${offer.fromUser.displayName}'s offer. You can chat now.`),
        onError: (err) =>
          toast.show({
            message: err instanceof ApiError ? err.message : 'Could not accept that offer.',
          }),
      },
    );

  const confirmAccept = (offer: OfferView) => {
    const dialogTitle = `Accept ${offer.fromUser.displayName}'s offer?`;
    const body =
      offer.requestedKind === 'need'
        ? 'The offered listing comes off the marketplace and your request closes.'
        : 'Both items come off the marketplace and every other pending interest in this item is closed automatically.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${dialogTitle}\n\n${body}`)) doAccept(offer);
      return;
    }
    haptic.warning();
    Alert.alert(dialogTitle, body, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Accept', onPress: () => doAccept(offer) },
    ]);
  };

  const doReject = (offer: OfferView) =>
    respond.mutate(
      { id: offer.id, action: 'reject' },
      {
        onSuccess: () => toast.show({ message: 'Offer declined.' }),
        onError: (err) =>
          toast.show({
            message: err instanceof ApiError ? err.message : 'Could not decline that offer.',
          }),
      },
    );

  return (
    <Card padded bordered elevated="xs">
      <Press
        onPress={() =>
          router.push(
            group.kind === 'listing'
              ? `/(app)/listing/${group.itemId}`
              : `/(app)/need/${group.itemId}`,
          )
        }
      >
        <Row gap="md" align="center">
          <CoverTile
            seed={group.itemId}
            uri={thumbUri}
            height={56}
            radius="md"
            style={{ width: 56 }}
            icon={
              <Ionicons
                name={categoryIcon(item.data?.category.slug ?? '')}
                size={22}
                color="rgba(255,255,255,0.7)"
              />
            }
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label" style={{ textTransform: 'uppercase', color: colors.textFaint }}>
              Your listing
            </Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
            <Row gap="sm">
              <Badge label={`${viewCount} ${viewCount === 1 ? 'view' : 'views'}`} kind="neutral" />
              <Badge
                label={`${interestedCount} interested`}
                kind={interestedCount > 0 ? 'match' : 'neutral'}
              />
            </Row>
          </View>
        </Row>
      </Press>

      <Stack gap="sm" style={{ marginTop: spacing.md }}>
        {group.offers.map((offer) => (
          <View
            key={offer.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.borderSoft,
              paddingTop: spacing.sm,
              gap: spacing.sm,
            }}
          >
            <ListRow
              leading={
                <Avatar
                  name={offer.fromUser.displayName}
                  size={36}
                  uri={mediaSrc(offer.fromUser.avatarUrl)}
                />
              }
              title={offer.fromUser.displayName}
              subtitle="Interested in this item"
              trailing={
                <Badge label={STATUS_LABEL[offer.status]} kind={STATUS_KIND[offer.status]} dot />
              }
              chevron={<Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
              onPress={() => router.push(`/(app)/offer/${offer.id}`)}
            />
            {offer.status === 'pending' ? (
              <Row gap="sm">
                <Button
                  label="Accept"
                  size="sm"
                  loading={respond.isPending}
                  onPress={() => confirmAccept(offer)}
                  leftIcon={<Ionicons name="checkmark" size={15} color={colors.textInverse} />}
                />
                <Button
                  label="Reject"
                  variant="quiet"
                  size="sm"
                  loading={respond.isPending}
                  onPress={() => doReject(offer)}
                />
              </Row>
            ) : offer.status === 'accepted' && offer.conversationId ? (
              <Button
                label="Message"
                variant="secondary"
                size="sm"
                onPress={() => router.push(`/(app)/chat/${offer.conversationId}`)}
                leftIcon={
                  <Ionicons name="chatbubbles-outline" size={15} color={colors.textPrimary} />
                }
              />
            ) : null}
          </View>
        ))}
      </Stack>
    </Card>
  );
}

/**
 * Matches — the single screen for everything about who you could trade with
 * and who already wants to: the reciprocal "you have / they need" candidate
 * feed (unchanged), PLUS incoming interest on your own listings (received
 * offers, with accept/reject) and what you've sent. Accepting an offer here
 * routes to the existing offer detail screen, which creates the barter
 * transaction and opens the existing chat — no parallel request system.
 */
const VALID_TABS: Tab[] = ['reciprocal', 'received', 'sent'];

export default function MatchesScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  // Entry points elsewhere (profile, messages/transactions empty states, a
  // need's "View offers") deep-link straight to the Received/Sent tab.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'reciprocal',
  );
  // The tab bar keeps this screen mounted across visits, so a fresh
  // `?tab=received` deep link (e.g. from Profile → Offers) needs to be
  // re-applied on every focus, not just on first mount.
  useFocusEffect(
    useCallback(() => {
      if (tabParam && VALID_TABS.includes(tabParam as Tab)) setTab(tabParam as Tab);
    }, [tabParam]),
  );
  const [incomingFilter, setIncomingFilter] = useState<IncomingFilter>('all');

  const matches = demoQuery(useMatches(), demoMatches);
  const matchCount = matches.data?.length ?? 0;

  const incoming = demoMergeList(
    useIncomingOffers(),
    demoOffers.filter((o) => !o.isMine),
  );
  const outgoing = demoMergeList(
    useOutgoingOffers(),
    demoOffers.filter((o) => o.isMine),
  );
  const pendingIncoming = (incoming.data ?? []).filter((o) => o.status === 'pending').length;
  const incomingCount = (status: IncomingFilter) =>
    status === 'all'
      ? (incoming.data ?? []).length
      : (incoming.data ?? []).filter((o) => o.status === status).length;

  const offersTab = tab === 'received' ? incoming : outgoing;
  const offersData =
    tab === 'received' && incomingFilter !== 'all'
      ? offersTab.data?.filter((o) => o.status === incomingFilter)
      : offersTab.data;

  const receivedGroups =
    tab === 'received' ? groupIncomingByListing(offersData ?? []) : EMPTY_GROUPS;

  return (
    <Screen padded={false}>
      <MatchesDecor />
      <MatchesHeader
        tab={tab}
        receivedLabel={pendingIncoming > 0 ? `Received · ${pendingIncoming}` : 'Received'}
        onTab={(v) => {
          setTab(v);
          if (v !== 'received') setIncomingFilter('all');
        }}
        onSettings={() => router.push('/(app)/account')}
        trailing={
          matchCount > 0 ? (
            <Badge label={`${matchCount} live`} kind="match" variant="solid" dot />
          ) : null
        }
      />

      {tab === 'received' ? (
        <FilterChips
          items={(['all', 'pending', 'accepted', 'rejected'] as const).map((status) => ({
            value: status,
            label: INCOMING_FILTER_LABEL[status],
            count: incomingCount(status),
          }))}
          value={incomingFilter}
          onChange={setIncomingFilter}
        />
      ) : null}

      {tab === 'reciprocal' ? (
        <FlatList
          data={matches.data ?? []}
          keyExtractor={(m) => m.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.sm,
            paddingBottom: layout.tabBarInset,
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            gap: spacing.lg,
            flexGrow: 1,
          }}
          refreshing={matches.isRefetching}
          onRefresh={() => void matches.refetch()}
          renderItem={({ item, index }) => (
            <Reveal index={index}>
              <MatchCard
                match={item}
                onPress={() => router.push(`/(app)/match/${encodeURIComponent(item.key)}`)}
              />
            </Reveal>
          )}
          ListEmptyComponent={
            matches.isPending ? (
              <SkeletonList count={3} />
            ) : matches.isError ? (
              <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />
            ) : (
              <EmptyShell
                art={<MirrorsArt />}
                large
                title={'No barter' + String.fromCharCode(10) + 'match yet'}
                body={[
                  'Add what you have and what you need.',
                  'When someone is the mirror of you, they',
                  'appear here — no money, just a fair swap.',
                ]}
              >
                <PrimaryCta
                  label="Explore what others have"
                  onPress={() => router.push('/(app)/(tabs)/discover')}
                />
                <SecondaryLink
                  label="Add something I have"
                  onPress={() => router.push('/(app)/new-listing')}
                />
              </EmptyShell>
            )
          }
          ListFooterComponent={
            /*
              Worth saying plainly: people distrust a feed that decides things
              for them. Stating the rule — same category, same kind, both ways —
              is what makes a match feel like a fact rather than a suggestion.
            */
            matchCount > 0 ? (
              <Notice
                kind="neutral"
                icon={
                  <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
                }
              >
                Matches follow one exact rule: the same category and kind on both sides, in both
                directions. No black-box scoring.
              </Notice>
            ) : null
          }
        />
      ) : tab === 'received' ? (
        <FlatList
          data={receivedGroups}
          keyExtractor={(g) => g.itemId}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.lg,
            paddingBottom: layout.tabBarInset,
            gap: spacing.md,
            flexGrow: 1,
          }}
          refreshing={incoming.isRefetching}
          onRefresh={() => void incoming.refetch()}
          renderItem={({ item, index }) => (
            <Reveal index={index}>
              <ReceivedListingGroup group={item} />
            </Reveal>
          )}
          ListEmptyComponent={
            incoming.isPending ? (
              <SkeletonList count={3} />
            ) : incoming.isError ? (
              <ErrorState error={incoming.error} onRetry={() => void incoming.refetch()} />
            ) : (
              <EmptyShell
                art={<ReceivedArt />}
                title="No interest yet"
                body={['When someone wants to trade for something', 'you have, it arrives here.']}
              />
            )
          }
        />
      ) : (
        <GroupedList
          data={offersData ?? []}
          key={tab}
          keyExtractor={(o) => o.id}
          showsVerticalScrollIndicator={false}
          separatorInset={spacing.lg + 40 + spacing.md}
          contentContainerStyle={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.lg,
            paddingBottom: layout.tabBarInset,
            flexGrow: 1,
          }}
          renderItem={({ item }) => {
            const person = item.isMine ? item.toUser : item.fromUser;
            return (
              <ListRow
                leading={
                  <Avatar name={person.displayName} size={40} uri={mediaSrc(person.avatarUrl)} />
                }
                title={item.isMine ? `To ${person.displayName}` : `From ${person.displayName}`}
                subtitle={`${item.offered.title} ↔ ${item.requested.title}`}
                // An offer waiting on YOU is the only row that gets emphasis.
                emphasis={!item.isMine && item.status === 'pending'}
                trailing={
                  <Badge label={STATUS_LABEL[item.status]} kind={STATUS_KIND[item.status]} dot />
                }
                chevron={<Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
                onPress={() => router.push(`/(app)/offer/${item.id}`)}
              />
            );
          }}
          ListEmptyComponent={
            offersTab.isPending ? (
              <SkeletonList count={3} />
            ) : offersTab.isError ? (
              <ErrorState error={offersTab.error} onRetry={() => void offersTab.refetch()} />
            ) : (
              <EmptyShell
                art={<SentArt />}
                title="No offers sent"
                body={['Open any listing you like and offer one of', 'your own items against it.']}
              >
                <PrimaryCta
                  label="Browse listings"
                  onPress={() => router.push('/(app)/(tabs)/discover')}
                />
              </EmptyShell>
            )
          }
        />
      )}
    </Screen>
  );
}
