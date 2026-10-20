import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  Button,
  EmptyState,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  spacing,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ItemCard } from '@/components/ItemCard';
import { ErrorState } from '@/components/states';
import { useFavourites, useToggleFavourite } from '@/lib/hooks/useFavourites';

/**
 * Listings the signed-in user has saved. Everything here comes from the
 * favourites API; a listing that has since been paused or sold stays in the
 * list marked as unavailable (rather than silently vanishing) with a way to
 * remove it.
 */
export default function SavedScreen() {
  const router = useRouter();
  const saved = useFavourites();
  const toggle = useToggleFavourite();

  return (
    <Screen scroll padded={false} edges={['top', 'bottom']}>
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
        <AppHeader title="Saved" subtitle="Listings you want to come back to." back />

        {saved.isPending ? (
          <SkeletonList count={3} />
        ) : saved.isError ? (
          <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
        ) : (saved.data ?? []).length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            body="Tap the heart on a listing to keep it here."
            actionLabel="Browse listings"
            actionVariant="secondary"
            onAction={() => router.replace('/(app)/(tabs)/discover')}
          />
        ) : (
          <Stack gap="md">
            {saved.data!.map((item) => {
              const available = item.status === 'published';
              return (
                <View key={item.id} style={{ gap: spacing.xs }}>
                  <ItemCard
                    item={item}
                    variant="list"
                    onPress={() => router.push(`/(app)/listing/${item.id}`)}
                  />
                  {!available ? (
                    <Row justify="space-between" align="center">
                      <Row gap="xs" align="center">
                        <Ionicons name="alert-circle-outline" size={15} color="#888" />
                        <Text variant="caption" tone="muted">
                          No longer available
                        </Text>
                      </Row>
                      <Button
                        label="Remove"
                        variant="quiet"
                        size="sm"
                        loading={toggle.isPending}
                        onPress={() => toggle.mutate({ listingId: item.id, save: false })}
                      />
                    </Row>
                  ) : null}
                </View>
              );
            })}
          </Stack>
        )}
      </View>
    </Screen>
  );
}
