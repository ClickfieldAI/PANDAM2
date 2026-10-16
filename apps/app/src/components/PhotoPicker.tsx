/**
 * The photo strip on the create/edit form.
 *
 * It handles both halves of the same job, because they are the same job at
 * different moments:
 *  - CREATE: there is no listing to attach a photo to yet, so picks are held
 *    locally and handed back on submit for the screen to upload afterwards.
 *  - EDIT: the item exists, so a pick uploads immediately and a tap on the
 *    cross deletes it — no "save" step, which is what people expect from a
 *    photo grid.
 *
 * `itemId` is what selects between them. `kind` picks listing vs need
 * storage — both can carry photos.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { type ItemImage } from '@pandam/types';
import { Press, Row, Text, radii, shadows, spacing, useThemeColors } from '@pandam/ui';
import { MAX_LISTING_IMAGES } from '@pandam/validation';

import { type MarketKind } from '@/lib/api/market';
import { SpringIn } from '@/components/brand/SpringIn';
import { mediaSrc } from '@/lib/api/media';
import { useDeleteItemImage, useUploadItemImages } from '@/lib/hooks/useMedia';

export interface PhotoPickerProps {
  /** Listing vs need — selects which storage the photos attach to. */
  kind: MarketKind;
  /** Photos already stored on the server (edit mode). */
  existing?: ItemImage[];
  /** Local picks not yet uploaded (create mode). */
  local: string[];
  onChangeLocal: (uris: string[]) => void;
  /** Present in edit mode: picks upload straight away against this item. */
  itemId?: string;
}

export function PhotoPicker({
  kind,
  existing = [],
  local,
  onChangeLocal,
  itemId,
}: PhotoPickerProps) {
  const colors = useThemeColors();

  const upload = useUploadItemImages(kind);
  const remove = useDeleteItemImage(kind);

  const managed = !!itemId;
  const total = existing.length + local.length;
  const remaining = MAX_LISTING_IMAGES - total;
  const busy = upload.isPending || remove.isPending;

  const pick = async () => {
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Re-encode at 0.8: a modern phone photo is 4–8 MB, which is slow to
      // upload and pointless at the size these are ever displayed.
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (res.canceled) return;
    const uris = res.assets.map((a) => a.uri).slice(0, remaining);

    if (managed) {
      upload.mutate(
        { itemId: itemId!, uris },
        {
          onError: () =>
            Alert.alert('Upload failed', 'Those photos could not be uploaded. Please try again.'),
        },
      );
      return;
    }
    onChangeLocal([...local, ...uris]);
  };

  const tile = {
    width: 96,
    height: 96,
    borderRadius: radii.lg,
  } as const;
  const print = {
    borderRadius: radii.lg + 4,
    padding: 4,
    backgroundColor: colors.surface,
    ...shadows.md,
  } as const;

  return (
    <View>
      <Row gap="md" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {existing.map((image, i) => (
          <SpringIn key={image.id} index={i}>
            <View style={print}>
              <Image
                source={{ uri: mediaSrc(image.url) }}
                style={tile}
                contentFit="cover"
                transition={150}
              />
              <Pressable
                accessibilityLabel="Remove photo"
                disabled={busy}
                onPress={() => remove.mutate({ itemId: itemId!, imageId: image.id })}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  backgroundColor: colors.surface,
                  borderRadius: radii.pill,
                }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </SpringIn>
        ))}

        {local.map((uri, i) => (
          <SpringIn key={uri} index={existing.length + i}>
            <View style={print}>
              <Image source={{ uri }} style={tile} contentFit="cover" />
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => onChangeLocal(local.filter((u) => u !== uri))}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  backgroundColor: colors.surface,
                  borderRadius: radii.pill,
                }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </SpringIn>
        ))}

        {remaining > 0 ? (
          <Press
            scale="md"
            accessibilityLabel="Add a photo"
            disabled={busy}
            onPress={() => void pick()}
            style={{
              width: 104,
              height: 104,
              borderRadius: radii.lg + 4,
              borderWidth: 2,
              borderColor: colors.accentBorder,
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: colors.accentSoft,
            }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={24} color={colors.accent} />
                <Text variant="caption" tone="accent" style={{ fontWeight: '700' }}>
                  Add photo
                </Text>
              </>
            )}
          </Press>
        ) : null}
      </Row>

      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {remaining <= 0
          ? `That is the maximum of ${MAX_LISTING_IMAGES} photos.`
          : managed
            ? 'Photos save as soon as you add them. The first one is the cover.'
            : total > 0
              ? 'These upload when you save. The first one is the cover.'
              : 'The first photo becomes the cover image.'}
      </Text>
    </View>
  );
}
