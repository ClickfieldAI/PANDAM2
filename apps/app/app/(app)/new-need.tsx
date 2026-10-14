import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { Press, Screen, layout } from '@pandam/ui';

import { ItemForm } from '@/components/ItemForm';
import { M } from '@/components/matches/MatchesUI';
import { CornerDecor } from '@/components/profile/ProfileUI';
import { markSubmitted } from '@/lib/drafts';
import { useUploadItemImages } from '@/lib/hooks/useMedia';
import { useCreateItem } from '@/lib/hooks/useMarket';

export default function NewNeedScreen() {
  const router = useRouter();
  const create = useCreateItem('need');
  const uploadImages = useUploadItemImages('need');

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
            Something I need
          </Text>
          <Text
            style={{
              fontFamily: 'InterTight_400Regular',
              fontSize: 15,
              color: '#555',
              marginTop: 2,
              marginBottom: 18,
              maxWidth: 330,
            }}
          >
            We find people who have it and want what you offer.
          </Text>
        </View>
      </View>

      <ItemForm
        kind="need"
        mode="create"
        submitting={create.isPending || uploadImages.isPending}
        error={create.error}
        onSubmit={({ photos, ...values }) =>
          create.mutate(values, {
            onSuccess: async (res) => {
              // The server confirmed the item exists — only now is the draft removed.
              await markSubmitted('need');
              // Photos can only be attached once the need has an id, so they
              // upload here rather than inside the form — same pattern as a
              // listing's own photos.
              if (photos?.length) {
                await uploadImages
                  .mutateAsync({ itemId: res.item.id, uris: photos })
                  .catch(() => undefined);
              }
              router.replace(`/(app)/need/${res.item.id}`);
            },
          })
        }
      />
    </Screen>
  );
}
