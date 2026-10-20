import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Alert, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { type MarketItem } from '@pandam/types';
import { EmptyState, Screen, SkeletonList, useToast } from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useM } from '@/components/matches/MatchesUI';
import {
  AvatarRing,
  BigHeader,
  CornerDecor,
  EndDecor,
  EmptyNeed,
  GUTTER,
  MenuRow,
  OutlinedButton,
  Panel,
  ProfileItemCard,
  SectionTitle,
  SettingsButton,
  StatTiles,
} from '@/components/profile/ProfileUI';
import { ErrorState } from '@/components/states';
import { IS_DEMO_DATA, demoMergeList, demoMyListings, demoMyNeeds } from '@/dummy';
import { type MarketKind } from '@/lib/api/market';
import { mediaSrc } from '@/lib/api/media';
import { useLogout, useSession } from '@/lib/auth/hooks';
import { useMyItems } from '@/lib/hooks/useMarket';
import { useUploadAvatar } from '@/lib/hooks/useMedia';
import { useUnreadNotificationCount } from '@/lib/hooks/useNotifications';
import { useTransactions } from '@/lib/hooks/useTransactions';
import { TourTarget } from '@/lib/tour/TourTarget';
import { useTour } from '@/lib/tour/TourProvider';
import { useThemeColors } from '@pandam/ui';

function MyItemsSection({
  kind,
  onOpen,
  onAdd,
}: {
  kind: MarketKind;
  onOpen: (item: MarketItem) => void;
  onAdd: () => void;
}) {
  const { width } = useWindowDimensions();
  const cardW = Math.floor((Math.min(width, 720) - GUTTER * 2 - 12) / 2);
  const q = demoMergeList(useMyItems(kind), kind === 'listing' ? demoMyListings : demoMyNeeds);
  const isHave = kind === 'listing';
  const items = q.data ?? [];
  const live = items.filter((i) => i.status === 'published').length;

  return (
    <View>
      <SectionTitle
        title={isHave ? 'Things I have' : 'Things I need'}
        subtitle={items.length > 0 ? `${live} live of ${items.length}` : undefined}
        actionLabel="Add"
        onAction={onAdd}
      />
      <View style={{ height: 12 }} />
      {q.isPending ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <SkeletonList count={1} />
        </View>
      ) : q.isError ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </View>
      ) : items.length === 0 ? (
        <EmptyNeed
          icon={isHave ? 'cube-outline' : 'search'}
          title={isHave ? 'Nothing listed yet' : 'Nothing requested yet'}
          body={
            isHave
              ? 'List something and people can start offering trades for it.'
              : 'Say what you are after — it is half of every match.'
          }
          actionLabel={isHave ? 'Add something I have' : 'Add something I need'}
          onAction={onAdd}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
        >
          {items.map((item) => (
            <ProfileItemCard key={item.id} item={item} width={cardW} onPress={() => onOpen(item)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const M = useM();

  const colors = useThemeColors();

  const uploadAvatar = useUploadAvatar();
  const avatarToast = useToast();
  const router = useRouter();
  const { user, profile } = useSession();
  const logout = useLogout();
  const tour = useTour();
  const scrollRef = useRef<ScrollView>(null);
  const unread = useUnreadNotificationCount();
  const myHave = demoMergeList(useMyItems('listing'), demoMyListings);
  const myNeed = demoMergeList(useMyItems('need'), demoMyNeeds);
  const trades = useTransactions();
  const tradeCount = IS_DEMO_DATA
    ? 4
    : (trades.data?.filter((t) => t.status === 'completed').length ?? 0);

  const open = (item: MarketItem) =>
    router.push(item.kind === 'listing' ? `/(app)/listing/${item.id}` : `/(app)/need/${item.id}`);

  if (!profile) {
    return (
      <Screen scroll tabBarInset>
        <AppHeader title="Profile" />
        <EmptyState title="Profile unavailable" body="Try again in a moment." />
      </Screen>
    );
  }

  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => router.replace('/(auth)/login') });
  // A stray tap must never end the session: ask first (Alert is a no-op on web).
  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of Pandam?')) signOut();
      return;
    }
    Alert.alert('Sign out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const verified = user?.identityVerification?.status === 'verified';
  const location = [profile.locationCity, profile.locationRegion, profile.locationCountry]
    .filter(Boolean)
    .join(', ');

  return (
    <Screen scroll scrollRef={scrollRef} padded={false} tabBarInset background={M.bg}>
      <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <CornerDecor />
        <BigHeader
          eyebrow="04"
          title="Profile"
          subtitle="Your items, interests and activity."
          right={<SettingsButton onPress={() => router.push('/(app)/account')} />}
        />

        {/* ------------------------------------------------- profile card -- */}
        <View
          style={{
            marginHorizontal: GUTTER,
            marginTop: 16,
            borderRadius: 14,
            borderWidth: 1.4,
            borderColor: M.line,
            backgroundColor: M.bg,
            padding: 16,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <AvatarRing size={76}>
              <AvatarPicker
                name={profile.displayName}
                size={76}
                uri={mediaSrc(profile.avatarUrl)}
                busy={uploadAvatar.isPending}
                onPicked={(uri) =>
                  uploadAvatar.mutate(uri, {
                    onSuccess: () => avatarToast.success('Photo updated.'),
                    onError: () =>
                      avatarToast.error('That photo could not be uploaded. Please try again.'),
                  })
                }
              />
            </AvatarRing>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'InterTight_900Black',
                  fontSize: 28,
                  lineHeight: 32,
                  color: M.ink,
                  letterSpacing: -1,
                }}
              >
                {profile.displayName}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: 'InterTight_400Regular',
                  fontSize: 14,
                  color: colors.textMuted,
                  marginTop: 1,
                }}
              >
                {profile.username ? `@${profile.username}` : user?.email}
              </Text>
              {verified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                  <Ionicons name="shield-checkmark" size={14} color={M.red} />
                  <Text
                    style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 13, color: M.red }}
                  >
                    Identity Verified ✓
                  </Text>
                </View>
              ) : null}
              {location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: 'InterTight_400Regular',
                      fontSize: 12.5,
                      color: colors.textMuted,
                      flexShrink: 1,
                    }}
                  >
                    {location}
                  </Text>
                </View>
              ) : null}
            </View>
            <OutlinedButton
              label="Edit"
              compact
              onPress={() => router.push('/(app)/edit-profile')}
            />
          </View>

          <StatTiles
            stats={[
              { n: myHave.data?.length ?? 0, label: 'Listed', red: true },
              { n: myNeed.data?.length ?? 0, label: 'Wanted' },
              { n: tradeCount, label: 'Trades done', red: true },
            ]}
          />

          {profile.bio ? (
            <Text
              style={{
                fontFamily: 'InterTight_400Regular',
                fontSize: 14.5,
                lineHeight: 20,
                color: colors.textSecondary,
              }}
            >
              {profile.bio}
            </Text>
          ) : null}
        </View>

        <View style={{ marginTop: 26, gap: 26 }}>
          <MyItemsSection
            kind="listing"
            onOpen={open}
            onAdd={() => router.push('/(app)/new-listing')}
          />
          <MyItemsSection kind="need" onOpen={open} onAdd={() => router.push('/(app)/new-need')} />

          <View>
            <SectionTitle title="Your trading" />
            <TourTarget id="profile-trading" scrollRef={scrollRef}>
              <Panel>
                <MenuRow
                  icon="heart-outline"
                  title="Saved"
                  subtitle="Listings you have hearted"
                  onPress={() => router.push('/(app)/saved')}
                />
                <MenuRow
                  icon="sparkles-outline"
                  title="Matches"
                  subtitle="Reciprocal barters found for you"
                  onPress={() => router.push('/(app)/(tabs)/matches')}
                />
                <MenuRow
                  icon="paper-plane-outline"
                  title="Offers"
                  subtitle="Proposals you have sent and received"
                  onPress={() => router.push('/(app)/(tabs)/matches?tab=received')}
                />
                <MenuRow
                  icon="chatbubble-outline"
                  title="Messages"
                  subtitle="Chats for trades you have agreed"
                  onPress={() => router.push('/(app)/messages')}
                />
                <MenuRow
                  icon="repeat-outline"
                  title="Transactions"
                  subtitle="Track and complete your trades"
                  onPress={() => router.push('/(app)/transactions')}
                />
                <MenuRow
                  icon="notifications-outline"
                  tone="neutral"
                  title="Notifications"
                  subtitle={unread > 0 ? `${unread} unread` : 'Offers, messages and trade updates'}
                  badge={unread}
                  last
                  onPress={() => router.push('/(app)/notifications')}
                />
              </Panel>
            </TourTarget>
          </View>

          <View>
            <SectionTitle title="Account" />
            <Panel>
              <MenuRow
                icon="person-outline"
                tone="neutral"
                title="Edit profile"
                subtitle="Name, username, bio, photo and city"
                onPress={() => router.push('/(app)/edit-profile')}
              />
              <MenuRow
                icon="shield-checkmark-outline"
                tone="neutral"
                title="Security"
                subtitle="Devices, password, delete account"
                onPress={() => router.push('/(app)/account')}
              />
              <MenuRow
                icon="cash-outline"
                tone="neutral"
                title="Platform fee (demo)"
                subtitle="DEMO · simulated sales, no real money"
                onPress={() => router.push('/(app)/platform-fee-demo')}
              />
              <TourTarget id="profile-replay" scrollRef={scrollRef}>
                <MenuRow
                  icon="compass-outline"
                  tone="neutral"
                  title="Take the app tour"
                  subtitle="A quick walkthrough of PANDAM"
                  onPress={tour.start}
                />
              </TourTarget>
              {user && (user.role === 'moderator' || user.role === 'admin') && (
                <MenuRow
                  icon="shield-checkmark-outline"
                  tone="neutral"
                  title="Moderation"
                  subtitle="Reports, users and trades (staff only)"
                  onPress={() => router.push('/(app)/admin')}
                />
              )}
              <MenuRow
                icon="ban-outline"
                tone="neutral"
                title="Blocked people"
                subtitle="See and unblock people you have blocked"
                onPress={() => router.push('/(app)/blocked')}
              />
              <MenuRow
                icon="log-out-outline"
                title={logout.isPending ? 'Signing out…' : 'Sign out'}
                chevron={false}
                last
                onPress={confirmSignOut}
              />
            </Panel>
          </View>
        </View>
        <EndDecor />
      </View>
    </Screen>
  );
}
