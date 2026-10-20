import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  Avatar,
  CountBadge,
  EmptyState,
  GroupedList,
  ListRow,
  Screen,
  SkeletonList,
  Text,
  layout,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { demoConversations, demoMergeList } from '@/dummy';
import { AppHeader } from '@/components/AppHeader';
import { ObjectCluster } from '@/components/brand/ObjectCluster';
import { ErrorState } from '@/components/states';
import { mediaSrc } from '@/lib/api/media';
import { timeAgo } from '@/lib/format';
import { useConversations } from '@/lib/hooks/useConversations';

export default function MessagesScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const conversations = demoMergeList(useConversations(), demoConversations);
  const items = conversations.data ?? [];
  const unreadCount = items.filter((c) => c.unread).length;

  return (
    <Screen padded={false}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
        }}
      >
        <AppHeader
          title="Messages"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} unread`
              : 'Chats open automatically when a trade is agreed.'
          }
          back
        />
      </View>

      <GroupedList
        data={items}
        keyExtractor={(c) => c.id}
        showsVerticalScrollIndicator={false}
        separatorInset={spacing.lg + 44 + spacing.md}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.md,
          paddingBottom: layout.tabBarInset,
          flexGrow: 1,
        }}
        renderItem={({ item }) => {
          const person = item.participants[0];
          const name = person?.displayName ?? 'PANDAM user';
          const preview = item.lastMessage
            ? `${item.lastMessage.isMine ? 'You: ' : ''}${item.lastMessage.body}`
            : 'Say hello — you agreed a trade.';

          return (
            <ListRow
              leading={
                <View>
                  <Avatar name={name} size={44} uri={mediaSrc(person?.avatarUrl)} />
                  {/*
                    The unread dot sits on the avatar rather than in the
                    trailing slot, so the eye finds it on the same scan that
                    reads who the message is from.
                  */}
                  {item.unreadCount > 0 ? (
                    <CountBadge
                      value={item.unreadCount}
                      color={colors.need}
                      ringColor={colors.surface}
                      style={{ position: 'absolute', top: -6, right: -6 }}
                    />
                  ) : null}
                </View>
              }
              title={name}
              subtitle={preview}
              emphasis={item.unreadCount > 0}
              trailing={
                <Text variant="caption" tone="faint">
                  {timeAgo(item.updatedAt)}
                </Text>
              }
              onPress={() => router.push(`/(app)/chat/${item.id}`)}
            />
          );
        }}
        ListEmptyComponent={
          conversations.isPending ? (
            <SkeletonList count={3} />
          ) : conversations.isError ? (
            <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
          ) : (
            <EmptyState
              art={<ObjectCluster left="headphones" right="plant" icon="chatbubble-ellipses" />}
              icon={<Ionicons name="chatbubbles-outline" size={22} color={colors.textSecondary} />}
              title="No conversations yet"
              body="A chat opens by itself the moment you and someone else agree a trade — there is nothing to start here."
              actionLabel="See your offers"
              actionVariant="secondary"
              onAction={() => router.push('/(app)/(tabs)/matches?tab=received')}
            />
          )
        }
      />
    </Screen>
  );
}
