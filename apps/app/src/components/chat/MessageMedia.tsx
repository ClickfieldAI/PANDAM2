import { Ionicons } from '@expo/vector-icons';
import { type MessageView } from '@pandam/types';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press, Text, radii, spacing, useThemeColors, useToast } from '@pandam/ui';

import { mediaSrc } from '@/lib/api/media';
import { openLocation } from '@/lib/contact';
import { formatCoordinates } from '@/lib/maps';

const TILE = { width: 220, height: 160 } as const;

/** Full-screen player for a chat video (native controls, starts playing). */
function VideoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" />
        {status === 'error' ? (
          <View
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              top: '45%',
              alignItems: 'center',
            }}
          >
            <Text variant="body" style={{ color: '#fff', textAlign: 'center' }}>
              This video could not be played. Close it and try again.
            </Text>
          </View>
        ) : null}
        <Press
          scale="md"
          accessibilityRole="button"
          accessibilityLabel="Close video"
          onPress={onClose}
          hitSlop={12}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 16,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Press>
      </View>
    </Modal>
  );
}

/** Full-screen photo. */
function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}
      >
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
        />
        <View style={{ position: 'absolute', top: insets.top + 12, right: 16 }}>
          <Ionicons name="close-circle" size={34} color="rgba(255,255,255,0.85)" />
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * The media part of a chat bubble: a photo, a video thumbnail with a play button, or a shared
 * location card. Text captions are drawn by the bubble itself. Returns null for a text message.
 */
export function MessageMedia({
  message,
  mine,
}: {
  message: Pick<MessageView, 'imageUrl' | 'videoUrl' | 'location'>;
  mine: boolean;
}) {
  const colors = useThemeColors();
  const toast = useToast();
  const [viewer, setViewer] = useState<'photo' | 'video' | null>(null);
  const [broken, setBroken] = useState(false);

  const photo = mediaSrc(message.imageUrl);
  const video = mediaSrc(message.videoUrl);
  const place = message.location;

  if (place) {
    const title = place.placeName?.trim() || 'Shared location';
    return (
      <Press
        scale="md"
        accessibilityRole="button"
        accessibilityLabel={`Location: ${title}. Open in Maps.`}
        onPress={async () => {
          const r = await openLocation(place);
          if (!r.ok) toast.error(r.message);
        }}
        style={{
          width: TILE.width,
          borderRadius: radii.md,
          backgroundColor: mine ? 'rgba(255,255,255,0.16)' : colors.surfaceMuted,
          padding: spacing.sm,
        }}
      >
        <View
          style={{
            height: 84,
            borderRadius: radii.sm,
            backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.borderSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="location" size={34} color={mine ? colors.textInverse : colors.accent} />
        </View>
        <Text
          variant="bodyStrong"
          numberOfLines={2}
          style={{ marginTop: spacing.xs, color: mine ? colors.textInverse : colors.textPrimary }}
        >
          {title}
        </Text>
        <Text
          variant="caption"
          style={{ color: mine ? 'rgba(255,255,255,0.85)' : colors.textMuted }}
        >
          {formatCoordinates(place)}
        </Text>
        <Text
          variant="caption"
          style={{
            marginTop: 4,
            fontWeight: '700',
            color: mine ? colors.textInverse : colors.accent,
          }}
        >
          Open in Maps
        </Text>
      </Press>
    );
  }

  if (video) {
    return (
      <>
        <Press
          scale="md"
          accessibilityRole="button"
          accessibilityLabel="Video. Play."
          onPress={() => setViewer('video')}
          style={{
            width: TILE.width,
            height: TILE.height,
            borderRadius: radii.md,
            overflow: 'hidden',
            backgroundColor: '#1A1A1A',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {photo && !broken ? (
            <Image
              source={{ uri: photo }}
              style={{ position: 'absolute', width: '100%', height: '100%' }}
              contentFit="cover"
              onError={() => setBroken(true)}
            />
          ) : null}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
          </View>
        </Press>
        {viewer === 'video' ? <VideoViewer url={video} onClose={() => setViewer(null)} /> : null}
      </>
    );
  }

  if (photo) {
    return (
      <>
        <Press
          scale="md"
          accessibilityRole="imagebutton"
          accessibilityLabel="Photo. Open full screen."
          onPress={() => setViewer('photo')}
        >
          <Image
            source={{ uri: photo }}
            style={{ width: TILE.width, height: TILE.height, borderRadius: radii.md }}
            contentFit="cover"
            transition={120}
          />
        </Press>
        {viewer === 'photo' ? <PhotoViewer url={photo} onClose={() => setViewer(null)} /> : null}
      </>
    );
  }

  return null;
}
