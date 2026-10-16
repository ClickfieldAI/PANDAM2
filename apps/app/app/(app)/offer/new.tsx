import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { type MarketItem, type OfferView } from '@pandam/types';
import {
  Button,
  Card,
  CoverTile,
  Field,
  Meta,
  MetaItem,
  Notice,
  Press,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  radii,
  spacing,
  useMotionOK,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { TradeStage } from '@/components/brand/TradeStage';
import { ErrorState } from '@/components/states';
import { IS_DEMO_DATA, demoItem, demoMergeList, demoMyListings, demoQuery } from '@/dummy';
import { ApiError } from '@/lib/api/client';
import { primaryImage, uploadOfferImage } from '@/lib/api/media';
import { TYPE_LABEL } from '@/lib/format';
import { useCreateOffer } from '@/lib/hooks/useOffers';
import { useItem, useMyItems } from '@/lib/hooks/useMarket';
import { categoryIcon } from '@/lib/icons';

/**
 * One of your listings, offered as the thing you would give.
 *
 * A choose-one list needs a real selection control. The previous version put
 * a 2px coloured ring around the whole card, which reads as a hover state
 * rather than a choice and shifted the layout as the ring appeared. A radio
 * mark says "pick one of these" before you have picked anything.
 */
function SelectableItem({
  item,
  selected,
  onSelect,
}: {
  item: MarketItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Press
      scale="none"
      dim={false}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={item.title}
      onPress={onSelect}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
      }}
      states={{ hover: selected ? null : { borderColor: colors.borderStrong } }}
    >
      <CoverTile
        seed={item.id}
        height={52}
        radius="md"
        uri={primaryImage(item.images)}
        icon={
          <Ionicons
            name={categoryIcon(item.category.slug)}
            size={30}
            color="rgba(255,255,255,0.5)"
          />
        }
        style={{ width: 52 }}
      />

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.title}
        </Text>
        <Meta>
          <MetaItem label={TYPE_LABEL[item.type]} />
          <MetaItem label={item.category.name} />
        </Meta>
      </View>

      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radii.pill,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderStrong,
          backgroundColor: selected ? colors.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Ionicons name="checkmark" size={14} color={colors.textInverse} /> : null}
      </View>
    </Press>
  );
}

/** Items that exist only in the client showcase can't take part in a real offer. */
const isRealId = (id: string) => !id.startsWith('demo-');

/**
 * "Offer a trade" — pick one of your own published, barter-eligible listings
 * to give, for either someone's listing (`requestedListingId`) or someone's
 * I NEED request (`requestedNeedId`). Optionally attach a photo and a
 * message. On success the chat is already open (the Worker creates the
 * trade conversation with the offer), so the success state offers it.
 */
export default function NewOfferScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const params = useLocalSearchParams<{ requestedListingId?: string; requestedNeedId?: string }>();
  const kind: 'listing' | 'need' = params.requestedNeedId ? 'need' : 'listing';
  const targetId = (kind === 'need' ? params.requestedNeedId : params.requestedListingId) ?? '';
  const liveRequested = useItem(kind, targetId);
  const demoRequested = IS_DEMO_DATA ? demoItem(targetId) : undefined;
  const requested = demoRequested ? demoQuery(liveRequested, demoRequested) : liveRequested;
  const mine = demoMergeList(useMyItems('listing'), demoMyListings);
  const create = useCreateOffer();
  const motionOK = useMotionOK();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  // Upload once: a retry after a failed SEND reuses the already-uploaded key.
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sentOffer, setSentOffer] = useState<OfferView | null>(null);
  const [showDone, setShowDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  const eligible = useMemo(
    () =>
      (mine.data ?? []).filter(
        (l) => isRealId(l.id) && l.status === 'published' && l.pricing?.transactionType !== 'sale',
      ),
    [mine.data],
  );
  const selected = eligible.find((i) => i.id === selectedId) ?? null;
  const targetIsReal = isRealId(targetId);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // No native crop step here: `allowsEditing: true` is known to silently
      // fail to return a result in Expo Go (it needs a real dev/production
      // build) — see PhotoPicker.tsx, which already picks without it.
      quality: 0.8,
    });
    const asset = res.canceled ? null : res.assets[0];
    const uri = asset?.uri;
    if (!uri) return;
    // `fileSize` is only populated on some platforms, but when present it's
    // the single most useful log line for diagnosing an upload that fails
    // with a generic "could not reach the API" — a large file on a slow/
    // unstable connection fails exactly the same way as the server being
    // genuinely unreachable.
    console.log('[offer/new] picked photo', {
      uri,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    });
    setPhoto(uri);
    setPhotoKey(null);
    setUploadError(null);
  };
  const removePhoto = () => {
    setPhoto(null);
    setPhotoKey(null);
    setUploadError(null);
  };

  const formError =
    uploadError ??
    (create.error instanceof ApiError
      ? create.error.message
      : create.error
        ? 'Could not send the offer. Check your connection and try again.'
        : null);

  const busy = uploading || create.isPending;

  const submit = async () => {
    if (!selectedId || !requested.data || !targetIsReal || busy || sentOffer) return;
    let imageKey = photoKey;
    if (photo && !imageKey) {
      setUploading(true);
      setUploadError(null);
      try {
        imageKey = (await uploadOfferImage(photo)).imageKey;
        setPhotoKey(imageKey);
      } catch (err) {
        // Surface the real reason (network vs. server-rejected vs. unknown)
        // instead of one generic sentence — this is the only signal we get
        // for diagnosing an upload failure on a device we can't inspect.
        const detail =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : null;
        setUploadError(
          `The photo could not be uploaded${detail ? ` (${detail})` : ''}. Try again, or remove it and send without it.`,
        );
        return;
      } finally {
        setUploading(false);
      }
    }
    create.mutate(
      {
        offeredListingId: selectedId,
        ...(kind === 'need' ? { requestedNeedId: targetId } : { requestedListingId: targetId }),
        message: message.trim() || undefined,
        imageKey: imageKey ?? undefined,
      },
      {
        onSuccess: ({ offer }) => {
          setSentOffer(offer);
          // Let the "trade sent" moment play, then show where to go next.
          doneTimer.current = setTimeout(() => setShowDone(true), motionOK ? 1300 : 300);
        },
      },
    );
  };

  /* ------------------------------------------------------ offer sent -- */
  if (sentOffer && showDone) {
    const name = sentOffer.toUser.displayName;
    return (
      <Screen scroll padded={false} edges={['top', 'bottom']}>
        <View
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing['4xl'],
            paddingBottom: spacing['3xl'],
          }}
        >
          <Stack gap="xl" align="center">
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.match,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="paper-plane" size={34} color={colors.textInverse} />
            </View>
            <Stack gap="xs" align="center">
              <Text variant="display" center>
                Offer Sent
              </Text>
              <Text variant="body" tone="secondary" center>
                Your trade offer has been sent to {name}. You can chat while they decide.
              </Text>
            </Stack>
            <Card padded style={{ alignSelf: 'stretch' }}>
              <Stack gap="xs">
                <Text variant="caption" tone="muted">
                  You offered
                </Text>
                <Text variant="bodyStrong">{sentOffer.offered.title}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
                  {sentOffer.requestedKind === 'need' ? 'For their request' : 'For'}
                </Text>
                <Text variant="bodyStrong">{sentOffer.requested.title}</Text>
              </Stack>
            </Card>
            <Stack gap="sm" style={{ alignSelf: 'stretch' }}>
              {sentOffer.conversationId ? (
                <Button
                  label={`Chat with ${name.split(' ')[0]}`}
                  size="lg"
                  fullWidth
                  leftIcon={<Ionicons name="chatbubbles" size={17} color={colors.textInverse} />}
                  onPress={() => router.replace(`/(app)/chat/${sentOffer.conversationId}`)}
                />
              ) : null}
              <Button
                label="View offer"
                variant="secondary"
                size="lg"
                fullWidth
                onPress={() => router.replace(`/(app)/offer/${sentOffer.id}`)}
              />
            </Stack>
          </Stack>
        </View>
      </Screen>
    );
  }

  const ownerName = requested.data?.owner.displayName;

  return (
    <Screen
      scroll
      padded={false}
      edges={['top', 'bottom']}
      footer={
        <Stack gap="sm">
          {formError ? (
            <Notice
              kind="danger"
              icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
            >
              {formError}
            </Notice>
          ) : null}
          {!targetIsReal ? (
            <Notice
              kind="neutral"
              icon={<Ionicons name="information-circle" size={16} color={colors.textMuted} />}
            >
              This item isn&apos;t accepting offers right now.
            </Notice>
          ) : null}
          <Button
            label={
              sentOffer
                ? 'Sent'
                : uploading
                  ? 'Uploading photo…'
                  : create.isPending
                    ? 'Sending…'
                    : 'Send offer'
            }
            size="lg"
            fullWidth
            disabled={!selectedId || !targetIsReal || !!sentOffer}
            loading={busy}
            onPress={() => void submit()}
            leftIcon={
              <Ionicons
                name={sentOffer ? 'checkmark' : 'paper-plane-outline'}
                size={17}
                color={colors.textInverse}
              />
            }
          />
          {!selectedId && eligible.length > 0 ? (
            <Text variant="caption" tone="muted" center>
              Pick one of your listings to offer.
            </Text>
          ) : null}
        </Stack>
      }
    >
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
          paddingBottom: spacing['3xl'],
        }}
      >
        <AppHeader
          title="Offer a trade"
          subtitle={
            kind === 'need'
              ? `Offer ${ownerName ? `${ownerName.split(' ')[0]} ` : ''}something for their request.`
              : 'Goods for goods — no money changes hands.'
          }
          back
        />

        <Stack gap="2xl">
          {requested.isPending ? (
            <SkeletonList count={1} />
          ) : requested.data ? (
            <TradeStage
              sending={busy}
              sent={!!sentOffer}
              get={{
                id: requested.data.id,
                title: requested.data.title,
                photo: primaryImage(requested.data.images),
              }}
              give={
                selected
                  ? { id: selected.id, title: selected.title, photo: primaryImage(selected.images) }
                  : null
              }
            />
          ) : null}

          <View>
            <View style={{ gap: 2, marginBottom: spacing.md }}>
              <Text variant="h3">What will you give?</Text>
              <Text variant="bodySm" tone="secondary">
                Pick one of your published listings. Sale-only items cannot be traded.
              </Text>
            </View>

            {mine.isPending ? (
              <SkeletonList count={2} />
            ) : mine.isError ? (
              <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
            ) : eligible.length === 0 ? (
              <Card padded>
                <Stack gap="md">
                  <Text variant="bodySm" tone="secondary">
                    You have nothing to offer yet — a trade needs something from both sides. Add a
                    listing and come back; this will still be here.
                  </Text>
                  <Button
                    label="Add something I have"
                    size="sm"
                    onPress={() => router.push('/(app)/new-listing')}
                  />
                </Stack>
              </Card>
            ) : (
              <Stack gap="sm">
                {eligible.map((item) => (
                  <SelectableItem
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
                  />
                ))}
              </Stack>
            )}
          </View>

          {/* ------------------------------------------------ optional photo -- */}
          <View style={{ gap: spacing.sm }}>
            <View style={{ gap: 2 }}>
              <Text variant="h3">Add a photo</Text>
              <Text variant="bodySm" tone="secondary">
                Optional — show what you&apos;re offering or an example of your work.
              </Text>
            </View>
            {photo ? (
              <View style={{ width: 120, height: 120 }}>
                <Image
                  source={{ uri: photo }}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: radii.lg,
                    backgroundColor: colors.surfaceMuted,
                  }}
                  resizeMode="cover"
                  accessibilityLabel="Photo attached to your offer"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  onPress={removePhoto}
                  hitSlop={10}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.surfaceInverse,
                    borderWidth: 2,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={15} color={colors.textInverse} />
                </Pressable>
              </View>
            ) : (
              <Press
                scale="sm"
                accessibilityRole="button"
                accessibilityLabel="Add a photo"
                onPress={() => void pickPhoto()}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: radii.lg,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: colors.accentBorder,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="camera-outline" size={24} color={colors.accent} />
                <Text variant="caption" tone="accent" style={{ fontWeight: '700' }}>
                  Add photo
                </Text>
              </Press>
            )}
          </View>

          {selected && requested.data ? (
            <Notice
              kind="success"
              icon={<Ionicons name="swap-horizontal" size={16} color={colors.accent} />}
            >
              You give “{selected.title}” for “{requested.data.title}”.
            </Notice>
          ) : null}

          <Field
            label="Add a message"
            optional
            placeholder="Say hello, or suggest where and when to swap…"
            hint="Offers with a message are answered more often."
            multiline
            value={message}
            onChangeText={setMessage}
          />
        </Stack>
      </View>
    </Screen>
  );
}
