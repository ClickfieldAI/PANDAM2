import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Press, Screen, layout, useToast } from '@pandam/ui';

import { useCelebrate } from '@/components/celebrate/CelebrationProvider';
import { ApiError } from '@/lib/api/client';
import { ItemForm } from '@/components/ItemForm';
import { useM } from '@/components/matches/MatchesUI';
import { CornerDecor } from '@/components/profile/ProfileUI';
import { markSubmitted } from '@/lib/drafts';
import { useUploadItemImages } from '@/lib/hooks/useMedia';
import { useCreateItem } from '@/lib/hooks/useMarket';
import { useThemeColors } from '@pandam/ui';

export default function NewListingScreen() {
  const M = useM();

  const colors = useThemeColors();

  const router = useRouter();
  const create = useCreateItem('listing');
  const uploadImages = useUploadItemImages('listing');
  const toast = useToast();
  const celebrate = useCelebrate();

  return (
    <Screen padded={false} edges={['top', 'bottom']} background={M.bg}>
      <View>
        <CornerDecor height={230} />
        <View style={{ paddingHorizontal: layout.gutter, paddingTop: 4 }}>
          <Press
            scale="lg"
            dim={false}
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
              fontSize: 40,
              lineHeight: 46,
              letterSpacing: -2,
              color: M.ink,
              marginTop: 14,
            }}
          >
            Something I have
          </Text>
          <Text
            style={{
              fontFamily: 'InterTight_400Regular',
              fontSize: 15,
              color: colors.textSecondary,
              marginTop: 2,
              marginBottom: 18,
              maxWidth: 330,
            }}
          >
            A product, a service, or a skill you can put on the table.
          </Text>
        </View>
      </View>

      <ItemForm
        kind="listing"
        mode="create"
        submitting={create.isPending || uploadImages.isPending}
        error={create.error}
        onSubmit={({ photos, ...values }) =>
          create.mutate(values, {
            onSuccess: async (res) => {
              // The server confirmed the item exists — only now is the draft removed.
              await markSubmitted('listing');
              // Photos can only be attached once the listing has an id, so they
              // upload here rather than inside the form. A failed upload still
              // lands on the listing: the item itself was created, and the
              // detail screen is where the owner can retry adding photos.
              if (photos?.length) {
                await uploadImages
                  .mutateAsync({ itemId: res.item.id, uris: photos })
                  .catch((err) => {
                    console.warn('[new-listing] photo upload failed:', err);
                    toast.error(
                      err instanceof ApiError
                        ? `Your listing was saved, but the photo failed: ${err.message}`
                        : 'Your listing was saved, but the photo could not be uploaded.',
                    );
                  });
              }
              if (res.item.status === 'published') celebrate('Listing published');
              router.replace(`/(app)/listing/${res.item.id}`);
            },
          })
        }
      />
    </Screen>
  );
}
