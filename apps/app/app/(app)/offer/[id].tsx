import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type OfferView } from '@pandam/types';
import {
  Avatar,
  Notice,
  Press,
  Screen,
  SkeletonList,
  haptic,
  useToast,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { useM } from '@/components/matches/MatchesUI';
import { CornerDecor } from '@/components/profile/ProfileUI';
import { ErrorState } from '@/components/states';
import { StatusPill } from '@/components/TradeContextCard';
import {
  AcceptedPanel,
  ActionButton,
  BottomPanel,
  MessageCard,
  OfferItemCard,
  SwapDivider,
} from '@/components/trade/OfferUI';
import { IS_DEMO_DATA, demoOffers, demoQuery } from '@/dummy';
import { ApiError } from '@/lib/api/client';
import { mediaSrc } from '@/lib/api/media';
import { TYPE_LABEL, timeAgo } from '@/lib/format';
import { useCelebrate } from '@/components/celebrate/CelebrationProvider';
import { useOffer, useOfferHistory, useRespondToOffer } from '@/lib/hooks/useOffers';
import { useTransactions } from '@/lib/hooks/useTransactions';

/** What the header says under the title, for the offer's REAL state. */
function subtitleFor(o: OfferView): string {
  switch (o.status) {
    case 'pending':
      return o.isMine ? 'Waiting on the other person' : 'Waiting on your reply';
    case 'accepted':
      return 'Trade agreed — arrange the swap';
    case 'rejected':
      return 'This offer was declined';
    case 'cancelled':
      return 'This offer was withdrawn';
    case 'countered':
      return o.isMine ? 'They answered with a counter-offer' : 'You answered with a counter-offer';
    default:
      return 'This offer expired';
  }
}

export default function OfferDetailScreen() {
  const M = useM();

  const colors = useThemeColors();

  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const liveOffer = useOffer(id);
  const demoOffer = IS_DEMO_DATA ? demoOffers.find((o) => o.id === id) : undefined;
  const offer = demoOffer ? demoQuery(liveOffer, demoOffer) : liveOffer;
  const respond = useRespondToOffer();
  const celebrate = useCelebrate();
  const transactions = useTransactions();
  const history = useOfferHistory(demoOffer ? undefined : id);

  const respondError =
    respond.error instanceof ApiError
      ? respond.error.message
      : respond.error
        ? 'Could not update the offer. Check your connection and try again.'
        : null;

  if (offer.isPending) {
    return (
      <Screen scroll>
        <AppHeader title="Offer" back />
        <SkeletonList count={2} />
      </Screen>
    );
  }
  if (offer.isError) {
    return (
      <Screen scroll>
        <AppHeader title="Offer" back />
        <ErrorState error={offer.error} onRetry={() => void offer.refetch()} />
      </Screen>
    );
  }
  const o = offer.data;
  if (!o) return null;

  const canRespond = o.status === 'pending';
  const iAmRecipient = !o.isMine;
  const person = o.isMine ? o.toUser : o.fromUser;
  const first = person.displayName.split(' ')[0];

  // Oriented to the viewer: what I hand over / what I receive, whoever sent it.
  const give = o.isMine ? o.offered : o.requested;
  const get = o.isMine ? o.requested : o.offered;

  // The real transaction behind this offer (exists once it was accepted).
  const transaction = transactions.data?.find((t) => t.offerId === o.id);
  const openTransaction = () =>
    router.push(transaction ? `/(app)/transaction/${transaction.id}` : '/(app)/transactions');

  /* Accepting is irreversible and creates a transaction plus a chat, so it
     asks first. Declining and withdrawing are recoverable — you can always
     make the offer again — so those act immediately. */
  const closesWhat =
    o.requestedKind === 'need'
      ? 'The offered listing comes off the marketplace and the request closes.'
      : 'Both items come off the marketplace.';
  const doAccept = () =>
    respond.mutate(
      { id: o.id, action: 'accept' },
      {
        onSuccess: () => {
          celebrate('Trade accepted');
          toast.success('Trade accepted. Keep chatting to arrange the swap.');
        },
      },
    );
  // React Native's Alert is a no-op on web, so the browser's own confirm is used there.
  const confirmAccept = () => {
    const title = 'Accept this trade?';
    const body = `You and ${person.displayName} will both be committed. ${closesWhat}`;
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${body}`)) doAccept();
      return;
    }
    haptic.warning();
    Alert.alert(title, body, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Accept trade', onPress: doAccept },
    ]);
  };

  const openChat = () => router.push(`/(app)/chat/${o.conversationId}`);
  // Only an item-for-item offer can be countered (the server enforces this too).
  const canCounter = canRespond && iAmRecipient && o.requestedKind === 'listing';
  const openCounter = () =>
    router.push({
      pathname: '/(app)/offer/new',
      params: { counterOf: o.id, requestedListingId: o.offered.id },
    });
  const chain = history.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: M.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
      >
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <CornerDecor height={250} />

          <View style={{ paddingHorizontal: 20 }}>
            <Press
              haptic="light"
              scale="lg"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)'))}
              hitSlop={12}
              style={{ width: 36, height: 36, justifyContent: 'center', marginLeft: -4 }}
            >
              <Ionicons name="chevron-back" size={26} color={M.ink} />
            </Press>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: 'InterTight_900Black',
                fontSize: 48,
                lineHeight: 52,
                letterSpacing: -2.4,
                color: M.ink,
                marginTop: 18,
              }}
            >
              {o.isMine ? 'Your offer' : 'Offer for you'}
            </Text>
            <Text
              style={{
                fontFamily: 'InterTight_400Regular',
                fontSize: 16,
                color: colors.textSecondary,
                marginTop: 2,
              }}
            >
              {subtitleFor(o)}
            </Text>

            {/* ------------------------------------------ participant row -- */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 24 }}>
              <Avatar name={person.displayName} size={56} uri={mediaSrc(person.avatarUrl)} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: 'InterTight_700Bold', fontSize: 20, color: M.ink }}
                >
                  {person.displayName}
                </Text>
                <Text
                  style={{
                    fontFamily: 'InterTight_400Regular',
                    fontSize: 14.5,
                    color: colors.textMuted,
                  }}
                >
                  {o.isMine ? 'You sent this' : 'Sent to you'} · {timeAgo(o.createdAt)}
                </Text>
              </View>
              <StatusPill status={o.status} />
            </View>

            {/* -------------------------------------------------- the trade -- */}
            <View style={{ marginTop: 22 }}>
              <OfferItemCard
                tone="give"
                label="You give"
                title={give.title}
                meta={[TYPE_LABEL[give.type], give.category.name]}
              />
              <SwapDivider />
              <OfferItemCard
                tone="get"
                label="You get"
                title={get.title}
                meta={[TYPE_LABEL[get.type], get.category.name]}
              />
            </View>

            {o.imageUrl ? (
              <View style={{ marginTop: 18 }}>
                <MessageCard label={o.isMine ? 'Photo you attached' : 'Photo attached'}>
                  <Image
                    source={{ uri: mediaSrc(o.imageUrl) }}
                    style={{
                      width: '100%',
                      aspectRatio: 4 / 3,
                      borderRadius: 8,
                      backgroundColor: colors.surfaceMuted,
                    }}
                    resizeMode="cover"
                    accessibilityLabel="Photo attached to this offer"
                  />
                </MessageCard>
              </View>
            ) : null}

            {o.message ? (
              <View style={{ marginTop: 18 }}>
                <MessageCard label={o.isMine ? 'Your message' : 'Their message'}>
                  <Text
                    style={{
                      fontFamily: 'InterTight_400Regular',
                      fontSize: 18,
                      lineHeight: 26,
                      color: M.ink,
                    }}
                  >
                    {o.message}
                  </Text>
                </MessageCard>
              </View>
            ) : null}

            {o.parentOfferId ? (
              <Text
                style={{
                  fontFamily: 'InterTight_600SemiBold',
                  fontSize: 13.5,
                  color: colors.textMuted,
                  marginTop: 16,
                }}
              >
                This is a counter-offer to an earlier offer.
              </Text>
            ) : null}

            {/* ------------------------------------------------ negotiation -- */}
            {chain.length > 1 ? (
              <View style={{ marginTop: 22, gap: 10 }}>
                <Text style={{ fontFamily: 'InterTight_800ExtraBold', fontSize: 18, color: M.ink }}>
                  Negotiation
                </Text>
                {chain.map((step, index) => (
                  <Press
                    key={step.id}
                    scale="sm"
                    accessibilityRole="button"
                    accessibilityLabel={`Open step ${index + 1}`}
                    onPress={() => step.id !== o.id && router.push(`/(app)/offer/${step.id}`)}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: step.id === o.id ? 2 : 1,
                      borderColor: step.id === o.id ? colors.accent : colors.borderSoft,
                      backgroundColor: colors.surface,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text
                        style={{ fontFamily: 'InterTight_700Bold', fontSize: 14, color: M.ink }}
                      >
                        {index === 0 ? 'Offer' : 'Counter'} ·{' '}
                        {step.isMine ? 'you' : step.fromUser.displayName}
                      </Text>
                      <StatusPill status={step.status} />
                    </View>
                    <Text style={{ fontSize: 13.5, color: colors.textSecondary }} numberOfLines={2}>
                      {step.offered.title} for {step.requested.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>
                      {timeAgo(step.createdAt)}
                    </Text>
                  </Press>
                ))}
              </View>
            ) : null}

            {respondError ? (
              <View style={{ marginTop: 16 }}>
                <Notice
                  kind="danger"
                  icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                >
                  {respondError}
                </Notice>
              </View>
            ) : null}

            {canRespond && iAmRecipient ? (
              <Text
                style={{
                  fontFamily: 'InterTight_400Regular',
                  fontSize: 13.5,
                  lineHeight: 19,
                  color: colors.textMuted,
                  marginTop: 16,
                }}
              >
                Accepting takes both items off the marketplace and opens a chat. No money is
                involved at any point.
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ---------------------------------------------------- action panel -- */}
      <BottomPanel bottomInset={insets.bottom}>
        {canRespond && iAmRecipient ? (
          <>
            <ActionButton
              kind="primary"
              icon="checkmark"
              label="Accept trade"
              loading={respond.isPending}
              onPress={confirmAccept}
            />
            {canCounter ? (
              <ActionButton
                kind="outline"
                icon="swap-horizontal"
                label="Counter offer"
                onPress={openCounter}
              />
            ) : null}
            {o.conversationId ? (
              <ActionButton
                kind="outline"
                icon="chatbubble-outline"
                label={`Chat with ${first}`}
                onPress={openChat}
              />
            ) : null}
            <ActionButton
              kind="text"
              label="Decline"
              loading={respond.isPending}
              onPress={() =>
                respond.mutate(
                  { id: o.id, action: 'reject' },
                  { onSuccess: () => toast.show({ message: 'Offer declined.' }) },
                )
              }
            />
          </>
        ) : canRespond ? (
          <>
            {o.conversationId ? (
              <ActionButton
                kind="outline"
                icon="chatbubble-outline"
                label={`Chat with ${first}`}
                onPress={openChat}
              />
            ) : null}
            <ActionButton
              kind="text"
              label="Withdraw offer"
              loading={respond.isPending}
              onPress={() =>
                respond.mutate(
                  { id: o.id, action: 'cancel' },
                  { onSuccess: () => toast.show({ message: 'Offer withdrawn.' }) },
                )
              }
            />
          </>
        ) : o.status === 'accepted' ? (
          <>
            <AcceptedPanel onPress={openTransaction} />
            <ActionButton
              kind="primary"
              icon="swap-horizontal"
              label="Open transaction"
              onPress={openTransaction}
            />
            {o.conversationId ? (
              <ActionButton
                kind="outline"
                icon="chatbubble-outline"
                label={`Chat with ${first}`}
                onPress={openChat}
              />
            ) : null}
          </>
        ) : o.status === 'countered' && o.counterOfferId ? (
          <ActionButton
            kind="primary"
            icon="swap-horizontal"
            label="View the counter-offer"
            onPress={() => router.push(`/(app)/offer/${o.counterOfferId}`)}
          />
        ) : o.conversationId ? (
          <ActionButton
            kind="outline"
            icon="chatbubble-outline"
            label={`Chat with ${first}`}
            onPress={openChat}
          />
        ) : (
          <Text
            style={{
              fontFamily: 'InterTight_600SemiBold',
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
            }}
          >
            {subtitleFor(o)}
          </Text>
        )}
      </BottomPanel>
    </View>
  );
}
