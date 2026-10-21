import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, Text as RNText, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  Avatar,
  EmptyState,
  KeyboardAvoid,
  Press,
  Reveal,
  Row,
  Screen,
  SkeletonList,
  Text,
  layout,
  radii,
  spacing,
  useMotionOK,
  useThemeColors,
} from '@pandam/ui';

import { AttachmentMenu } from '@/components/chat/AttachmentMenu';
import { ContactActions } from '@/components/chat/ContactActions';
import { LocationShareSheet, type PickedLocation } from '@/components/chat/LocationShareSheet';
import { MessageMedia } from '@/components/chat/MessageMedia';
import { useM } from '@/components/matches/MatchesUI';
import { CornerDecor } from '@/components/profile/ProfileUI';
import { IS_DEMO_DATA, demoConversations, demoMessages, demoQuery } from '@/dummy';
import { ErrorState } from '@/components/states';
import { TradeContextCard, tradeSubtitle } from '@/components/TradeContextCard';
import { TypingIndicator } from '@/components/TypingIndicator';
import { useOffer } from '@/lib/hooks/useOffers';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/hooks';
import { useChatOutbox } from '@/lib/chat/OutboxProvider';
import { type ThreadItem, mergeThread, newClientId } from '@/lib/chat/outbox-core';
import { mediaSrc, uploadChatPhoto, uploadChatVideo } from '@/lib/api/media';
import {
  type PickedMedia,
  checkPickedMedia,
  mediaFileName,
  mediaType,
} from '@/lib/chat/attachments';
import { dayLabel, timeOfDay } from '@/lib/format';
import {
  useConversation,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useTypingIndicator,
} from '@/lib/hooks/useConversations';

/** A message, plus what its neighbours mean for how it should be drawn. */
interface Rendered {
  /** The message plus its honest delivery state (sending / waiting / failed / sent / seen). */
  thread: ThreadItem;
  message: ThreadItem['message'];
  /** First of a run from the same person — gets the rounded outer corner. */
  startsRun: boolean;
  /** Last of a run — gets the tail and the timestamp. */
  endsRun: boolean;
  /** Day separator to draw above it, if the day changed. */
  daySeparator: string | null;
}

/** Two messages belong to the same run if same sender and within five minutes. */
const RUN_WINDOW_MS = 5 * 60_000;

function group(thread: ThreadItem[]): Rendered[] {
  const messages = thread.map((t) => t.message);
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];

    const sameAsPrev =
      !!prev &&
      prev.isMine === message.isMine &&
      message.createdAt - prev.createdAt < RUN_WINDOW_MS;
    const sameAsNext =
      !!next &&
      next.isMine === message.isMine &&
      next.createdAt - message.createdAt < RUN_WINDOW_MS;

    const dayChanged = !prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt);

    return {
      thread: thread[i]!,
      message,
      startsRun: !sameAsPrev || dayChanged,
      endsRun: !sameAsNext,
      daySeparator: dayChanged ? dayLabel(message.createdAt) : null,
    };
  });
}

/**
 * One message.
 *
 * Consecutive messages from the same person are drawn as a run: square inner
 * corners, one tail at the bottom, and a single timestamp on the last bubble.
 * Stamping every bubble with a time — which is what this screen did before —
 * turns a two-line exchange into a wall of metadata, and the times are all
 * within a minute of each other anyway.
 *
 * Bubbles are editorial, not pill-shaped: a modest 8px radius that squares
 * off on the speaker's side mid-run, a thin black hairline on incoming
 * copy, flat PANDAM orange on outgoing — the same structural language as
 * every card elsewhere in the product, not a borrowed messaging-app style.
 */
function Bubble({
  item,
  isLastMine,
  onRetry,
  onDiscard,
}: {
  item: Rendered;
  /** The newest message the caller sent — the only one that shows "Sent" / "Seen". */
  isLastMine: boolean;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}) {
  const M = useM();

  const colors = useThemeColors();

  const { message, startsRun, endsRun } = item;
  const mine = message.isMine;
  const hasMedia = !!(message.imageUrl || message.videoUrl || message.location);

  return (
    <Reveal offset={8} style={{ alignSelf: 'stretch' }}>
      <View
        style={{
          maxWidth: '82%',
          alignSelf: mine ? 'flex-end' : 'flex-start',
          alignItems: mine ? 'flex-end' : 'flex-start',
          marginTop: startsRun ? spacing.md : 2,
        }}
      >
        <View
          style={{
            backgroundColor: mine ? M.red : M.surface,
            borderWidth: mine ? 0 : 1.2,
            borderColor: colors.borderSoft,
            borderRadius: 14,
            // The corner facing this speaker's side squares off mid-run, so a
            // run reads as one block of speech rather than three separate ones.
            borderTopRightRadius: mine && !startsRun ? radii.xs : radii.lg,
            borderBottomRightRadius: mine && !endsRun ? radii.xs : radii.lg,
            borderTopLeftRadius: !mine && !startsRun ? radii.xs : radii.lg,
            borderBottomLeftRadius: !mine && !endsRun ? radii.xs : radii.lg,
            padding: hasMedia ? spacing.xs : undefined,
            paddingHorizontal: hasMedia ? undefined : 16,
            paddingVertical: hasMedia ? undefined : 11,
          }}
        >
          {hasMedia ? (
            <View style={{ marginBottom: message.body ? spacing.xs : 0 }}>
              <MessageMedia message={message} mine={mine} />
            </View>
          ) : null}
          {message.body ? (
            <Text
              variant="body"
              style={{
                lineHeight: 22,
                marginHorizontal: hasMedia ? spacing.xs : 0,
                marginBottom: hasMedia ? spacing.xxs : 0,
                color: mine ? colors.textInverse : colors.textPrimary,
              }}
            >
              {message.body}
            </Text>
          ) : null}
        </View>

        {/* Delivery state — only what is actually known. "Seen" appears only when the
            recipient's read marker proves it; there is no "delivered" state. */}
        {item.thread.state === 'failed' && item.thread.clientId ? (
          <View style={{ alignItems: 'flex-end', marginTop: 3, marginHorizontal: spacing.xs }}>
            <Text variant="caption" tone="danger" style={{ fontSize: 11.5 }}>
              Not sent{item.thread.error ? ' · ' + item.thread.error : ''}
            </Text>
            <Row gap="md" style={{ marginTop: 2 }}>
              <Text
                variant="caption"
                tone="accent"
                accessibilityRole="button"
                style={{ fontWeight: '700', fontSize: 12 }}
                onPress={() => onRetry(item.thread.clientId!)}
              >
                Retry
              </Text>
              <Text
                variant="caption"
                tone="muted"
                accessibilityRole="button"
                style={{ fontSize: 12 }}
                onPress={() => onDiscard(item.thread.clientId!)}
              >
                Delete
              </Text>
            </Row>
          </View>
        ) : item.thread.state === 'sending' || item.thread.state === 'waiting' ? (
          <Text
            variant="caption"
            tone="faint"
            style={{ marginTop: 3, marginHorizontal: spacing.xs, fontSize: 10.5 }}
          >
            {item.thread.state === 'waiting' ? 'No connection — will keep trying' : 'Sending…'}
          </Text>
        ) : endsRun ? (
          <Text
            variant="caption"
            tone="faint"
            style={{ marginTop: 3, marginHorizontal: spacing.xs, fontSize: 10.5 }}
          >
            {timeOfDay(message.createdAt)}
            {mine && isLastMine ? (item.thread.state === 'seen' ? ' · Seen' : ' · Sent') : ''}
          </Text>
        ) : null}
      </View>
    </Reveal>
  );
}

/** The "Today" / "Yesterday" rule between days — a Swiss hairline, not a pill. */
function DaySeparator({ label }: { label: string }) {
  const colors = useThemeColors();

  return (
    <Row gap="md" align="center" style={{ marginTop: spacing.xl, marginBottom: spacing.xs }}>
      <View style={{ flex: 1, height: layout.hairline, backgroundColor: colors.borderSoft }} />
      <Text variant="caption" tone="muted" caps style={{ letterSpacing: 1.2, fontWeight: '600' }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: layout.hairline, backgroundColor: colors.borderSoft }} />
    </Row>
  );
}

/**
 * The composer's send action. A refined PANDAM square, not the generic
 * circular messaging-app button — orange with a black edge once there is
 * something to send, a flat muted square otherwise. A quick weighted tap
 * (1 → 0.94 → 1) stands in for the press ripple every other primary action
 * in the product already uses.
 */
function SendButton({
  active,
  disabled,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const M = useM();

  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (motionOK) {
      scale.set(withSequence(withTiming(0.94, { duration: 90 }), withTiming(1, { duration: 110 })));
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onPress();
  };

  return (
    <Press
      scale="none"
      dim={false}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Send message"
      onPress={handlePress}
      hitSlop={6}
      style={{ borderRadius: radii.pill }}
    >
      <Animated.View
        style={[
          {
            width: 46,
            height: 46,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? M.red : M.border,
            borderWidth: 0,
          },
          style,
        ]}
      >
        <Ionicons
          name="arrow-up"
          size={22}
          color={active ? colors.textInverse : colors.textMuted}
        />
      </Animated.View>
    </Press>
  );
}

export default function ChatScreen() {
  const M = useM();

  const colors = useThemeColors();

  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const liveConversation = useConversation(conversationId);
  const liveMessages = useMessages(conversationId);
  const demoConv = IS_DEMO_DATA
    ? demoConversations.find((c) => c.id === conversationId)
    : undefined;
  const conversation = demoConv ? demoQuery(liveConversation, demoConv) : liveConversation;
  const messages = demoConv
    ? demoQuery(liveMessages, demoMessages[demoConv.id] ?? [])
    : liveMessages;
  const send = useSendMessage(conversationId!);
  const { user: me } = useSession();
  const outbox = useChatOutbox();
  const markRead = useMarkConversationRead(conversationId!);
  const typing = useTypingIndicator(conversationId);
  const [draft, setDraft] = useState('');
  // A photo or video chosen but not yet sent: previewed in the composer, uploaded on Send.
  const [pending, setPending] = useState<(PickedMedia & { thumbUri?: string | null }) | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [progress, setProgress] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Rendered>>(null);

  useEffect(() => {
    if (conversationId) markRead.mutate();
    // Mark read once per conversation visit — not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const person = conversation.data?.participants[0];
  // The trade this chat belongs to (every trade chat is tied to one offer).
  const offer = useOffer(conversation.data?.offerId ?? undefined);
  const name = person?.displayName ?? 'Chat';
  const rendered = useMemo(
    () => group(mergeThread(conversationId!, messages.data ?? [], outbox.entries, me?.id ?? '')),
    [conversationId, messages.data, outbox.entries, me?.id],
  );
  const lastMineKey = [...rendered].reverse().find((r) => r.message.isMine)?.thread.key;

  // Once the server returns a message we queued, the queue entry is finished.
  const { reconcile } = outbox;
  useEffect(() => {
    if (messages.data) reconcile(messages.data);
  }, [messages.data, reconcile]);
  const canSend = (!!draft.trim() || !!pending) && !send.isPending && !uploadingImage;
  const [sendError, setSendError] = useState<string | null>(null);

  /** Choose a photo or video from the gallery; check it here, preview it, upload on Send. */
  const pickMedia = async () => {
    setAttachError(null);
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        allowsMultipleSelection: false,
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
    } catch {
      setAttachError('Could not open your gallery. Check that PANDAM may access your photos.');
      return;
    }
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    const picked: PickedMedia = {
      kind: asset.type === 'video' ? 'video' : 'image',
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    };
    const problem = checkPickedMedia(picked);
    if (problem) {
      setAttachError(problem);
      return;
    }
    let thumbUri: string | null = null;
    if (picked.kind === 'video') {
      try {
        thumbUri = (await VideoThumbnails.getThumbnailAsync(picked.uri, { time: 500 })).uri;
      } catch {
        // No thumbnail (unsupported here): the video still sends, with a plain play tile.
      }
    }
    setPending({ ...picked, thumbUri });
  };

  const cancelUpload = () => abortRef.current?.();

  const sendLocation = (place: PickedLocation) => {
    send.mutate(
      {
        location: {
          latitude: place.latitude,
          longitude: place.longitude,
          ...(place.placeName ? { placeName: place.placeName } : {}),
        },
        clientId: newClientId(),
      },
      {
        onSuccess: () => {
          setLocationOpen(false);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        },
        onError: (e) => {
          setLocationOpen(false);
          setAttachError(
            e instanceof ApiError ? e.message : 'Could not send your location. Try again.',
          );
        },
      },
    );
  };

  const handleSend = async () => {
    if (!canSend) return;
    const body = draft.trim();
    const media = pending;
    setDraft('');
    setPending(null);
    setAttachError(null);
    setSendError(null);
    typing.stopTyping();

    // A text message goes through the persistent outbox: it is saved on the
    // device first, shown as "sending", retried if the connection drops, and
    // de-duplicated by the server — so it can neither be lost nor doubled.
    if (!media) {
      outbox.enqueue(conversationId!, body);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      return;
    }

    // Photos and videos need their upload to finish first, so they are sent directly
    // (not queued): if anything fails the draft and the attachment come BACK so nothing
    // the user composed is silently lost.
    const restore = (message: string) => {
      setDraft(body);
      setPending(media);
      setSendError(message);
    };
    setUploadingImage(true);
    setProgress(0);
    let imageKey: string | undefined;
    let videoKey: string | undefined;
    try {
      const file = { uri: media.uri, name: mediaFileName(media), type: mediaType(media) };
      if (media.kind === 'image') {
        const up = uploadChatPhoto(conversationId!, file, setProgress);
        abortRef.current = up.abort;
        imageKey = (await up.promise).imageKey;
      } else {
        // The thumbnail is small: it takes the first tenth of the progress bar.
        if (media.thumbUri) {
          const t = uploadChatPhoto(
            conversationId!,
            { uri: media.thumbUri, name: 'thumbnail.jpg', type: 'image/jpeg' },
            (f) => setProgress(f * 0.1),
          );
          abortRef.current = t.abort;
          imageKey = (await t.promise).imageKey;
        }
        const v = uploadChatVideo(conversationId!, file, (f) => setProgress(0.1 + f * 0.9));
        abortRef.current = v.abort;
        videoKey = (await v.promise).videoKey;
      }
    } catch (err) {
      console.warn('[chat] attachment upload failed:', err);
      abortRef.current = null;
      setUploadingImage(false);
      const cancelled = err instanceof ApiError && err.code === 'aborted';
      setAttachError(
        cancelled
          ? 'Upload cancelled.'
          : err instanceof ApiError
            ? err.message
            : `Could not upload that ${media.kind}. Check your connection and try again.`,
      );
      restore('Your message was not sent.');
      return;
    }
    abortRef.current = null;
    setUploadingImage(false);

    send.mutate(
      { body: body || undefined, imageKey, videoKey, clientId: newClientId() },
      {
        onSuccess: () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50),
        onError: (e) =>
          restore(
            e instanceof ApiError
              ? e.message
              : 'Could not send. Check your connection and try again.',
          ),
      },
    );
  };

  // The composer's own change handler — not a replacement for it — so typing
  // keeps using the plain `Input` it always has. An empty box (the whole
  // draft deleted) stops the signal immediately rather than waiting out the
  // debounce.
  const handleDraftChange = (text: string) => {
    setDraft(text);
    if (text.trim()) typing.notifyTyping();
    else typing.stopTyping();
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']} background={M.bg}>
      <View style={{ zIndex: 0 }}>
        <CornerDecor height={230} />
        <View style={{ paddingHorizontal: layout.gutter, paddingTop: 4 }}>
          <Press
            scale="lg"
            dim={false}
            accessibilityRole="button"
            accessibilityLabel="Back to messages"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/messages'))}
            hitSlop={12}
            style={{ width: 36, height: 36, justifyContent: 'center', marginLeft: -4 }}
          >
            <Ionicons name="chevron-back" size={26} color={M.ink} />
          </Press>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <Press
              scale="none"
              dim={false}
              accessibilityRole="button"
              accessibilityLabel={`${name}, open their listings`}
              onPress={() =>
                person ? router.push(`/(app)/(tabs)/discover?owner=${person.id}`) : undefined
              }
              style={{ flex: 1, minWidth: 0 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Avatar name={name} size={64} uri={mediaSrc(person?.avatarUrl)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <RNText
                    numberOfLines={1}
                    style={{ fontFamily: 'InterTight_700Bold', fontSize: 24, color: M.ink }}
                  >
                    {name}
                  </RNText>
                  <RNText
                    numberOfLines={2}
                    style={{
                      fontFamily: 'InterTight_400Regular',
                      fontSize: 15,
                      lineHeight: 20,
                      color: colors.textSecondary,
                    }}
                  >
                    {tradeSubtitle(offer.data)}
                  </RNText>
                </View>
              </View>
            </Press>

            <Press
              scale="lg"
              dim={false}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${name}`}
              onPress={() =>
                person
                  ? router.push(
                      `/(app)/report?subjectType=user&subjectId=${person.id}&label=${encodeURIComponent(name)}`,
                    )
                  : undefined
              }
              style={{
                width: 50,
                height: 50,
                borderRadius: 10,
                backgroundColor: M.surface,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.borderSoft,
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={M.ink} />
            </Press>
          </View>
        </View>
      </View>

      {conversation.data ? (
        <View
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.lg,
          }}
        >
          <ContactActions
            conversationId={conversationId!}
            canContact={conversation.data.canContact}
            onMessage={() => inputRef.current?.focus()}
          />
        </View>
      ) : null}

      {offer.data ? (
        <View
          style={{
            width: '100%',
            maxWidth: layout.contentMaxWidth,
            alignSelf: 'center',
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.md,
          }}
        >
          <TradeContextCard
            offer={offer.data}
            onOpen={() => router.push(`/(app)/offer/${offer.data!.id}`)}
          />
        </View>
      ) : null}

      <KeyboardAvoid style={{ flex: 1 }}>
        <View style={{ flex: 1, position: 'relative' }}>
          {messages.isPending ? (
            <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
              <SkeletonList count={3} />
            </View>
          ) : messages.isError ? (
            <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
          ) : (
            <FlatList
              ref={listRef}
              data={rendered}
              keyExtractor={(r) => r.thread.key}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                width: '100%',
                maxWidth: layout.contentMaxWidth,
                alignSelf: 'center',
                paddingHorizontal: layout.gutter,
                paddingVertical: spacing.lg,
                flexGrow: 1,
              }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => (
                <>
                  {item.daySeparator ? <DaySeparator label={item.daySeparator} /> : null}
                  <Bubble
                    item={item}
                    isLastMine={item.thread.key === lastMineKey}
                    onRetry={outbox.retry}
                    onDiscard={outbox.discard}
                  />
                </>
              )}
              ListEmptyComponent={
                <EmptyState
                  tone="accent"
                  icon={<Ionicons name="hand-left-outline" size={22} color={colors.accent} />}
                  title="Say hello"
                  body={`You and ${name} agreed a trade. Sort out where and when to swap.`}
                />
              }
              ListFooterComponent={
                typing.otherTyping ? (
                  <TypingIndicator name={name} avatarUri={mediaSrc(person?.avatarUrl)} />
                ) : null
              }
            />
          )}
        </View>

        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.borderSoft,
            backgroundColor: colors.surface,
          }}
        >
          {pending ? (
            <Row
              gap="sm"
              align="center"
              style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.md }}
            >
              <View style={{ position: 'relative' }}>
                <Image
                  source={{
                    uri: pending.kind === 'video' ? (pending.thumbUri ?? undefined) : pending.uri,
                  }}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radii.md,
                    borderWidth: layout.hairline,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceMuted,
                  }}
                  resizeMode="cover"
                />
                {pending.kind === 'video' ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="play-circle" size={26} color="rgba(255,255,255,0.95)" />
                  </View>
                ) : null}
                <Press
                  scale="none"
                  dim={false}
                  accessibilityRole="button"
                  accessibilityLabel={uploadingImage ? 'Cancel upload' : `Remove ${pending.kind}`}
                  onPress={uploadingImage ? cancelUpload : () => setPending(null)}
                  hitSlop={6}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: radii.pill,
                    backgroundColor: colors.need,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={13} color={colors.textInverse} />
                </Press>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">
                  {uploadingImage
                    ? `Uploading ${pending.kind}… ${Math.round(progress * 100)}%`
                    : pending.kind === 'video'
                      ? 'Video ready to send'
                      : 'Photo ready to send'}
                </Text>
                {uploadingImage ? (
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                    style={{
                      marginTop: 6,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: colors.borderSoft,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round(progress * 100)}%`,
                        height: '100%',
                        backgroundColor: M.red,
                      }}
                    />
                  </View>
                ) : null}
              </View>
            </Row>
          ) : null}

          {sendError ? (
            <Text
              variant="caption"
              tone="danger"
              accessibilityLiveRegion="polite"
              style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.sm }}
            >
              {sendError} Your message is back in the box.
            </Text>
          ) : null}

          {attachError ? (
            <Text
              variant="caption"
              tone="danger"
              style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.sm }}
            >
              {attachError}
            </Text>
          ) : null}

          <Row
            gap="sm"
            align="flex-end"
            style={{ paddingHorizontal: layout.gutter, paddingVertical: spacing.md }}
          >
            <Press
              scale="lg"
              dim={false}
              accessibilityRole="button"
              accessibilityLabel="Attach a photo, video or location"
              disabled={uploadingImage}
              onPress={() => setMenuOpen(true)}
              hitSlop={6}
              style={{ width: 40, height: 46, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="add-circle-outline" size={28} color={M.ink} />
            </Press>
            <View style={{ flex: 1 }}>
              <TextInput
                ref={inputRef}
                placeholder="Message..."
                placeholderTextColor={colors.textMuted}
                value={draft}
                onChangeText={handleDraftChange}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                multiline
                accessibilityLabel="Message"
                // Grows from one line; a fixed 104pt multiline box is far too tall here.
                style={{
                  minHeight: 46,
                  maxHeight: 120,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderRadius: 10,
                  borderWidth: 1.2,
                  borderColor: colors.borderSoft,
                  backgroundColor: colors.surfaceMuted,
                  fontFamily: 'InterTight_400Regular',
                  fontSize: 16,
                  color: M.ink,
                }}
              />
            </View>
            <SendButton active={canSend} disabled={!canSend} onPress={() => void handleSend()} />
          </Row>
        </View>
      </KeyboardAvoid>

      <AttachmentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onPickMedia={() => void pickMedia()}
        onShareLocation={() => setLocationOpen(true)}
      />
      <LocationShareSheet
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        onConfirm={sendLocation}
        sending={send.isPending}
      />
    </Screen>
  );
}
