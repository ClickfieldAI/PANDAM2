import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';

import { EmptyState, layout, useThemeColors } from '@pandam/ui';

/**
 * The 404.
 *
 * Built from the same `EmptyState` as every other "there is nothing here"
 * moment in the product, rather than a bespoke layout. A 404 that looks
 * different from the rest of the app reads as an error page from a different
 * piece of software — which, to the person who hit it, is exactly the wrong
 * message.
 */
export default function NotFound() {
  const colors = useThemeColors();

  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: layout.gutter,
          backgroundColor: colors.background,
        }}
      >
        <View style={{ width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' }}>
          <EmptyState
            icon={<Ionicons name="compass-outline" size={22} color={colors.textSecondary} />}
            title="This screen does not exist"
            body="The link may be out of date, or the item may have been traded away."
            actionLabel="Go to Home"
            onAction={() => router.replace('/(app)/(tabs)')}
            secondaryLabel="Browse listings"
            onSecondary={() => router.replace('/(app)/(tabs)/discover')}
          />
        </View>
      </View>
    </>
  );
}
