import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { type BarterTransactionView } from '@pandam/types';
import {
  Avatar,
  Badge,
  EmptyState,
  GroupedList,
  ListRow,
  Screen,
  SkeletonList,
  layout,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ObjectCluster } from '@/components/brand/ObjectCluster';
import { ErrorState } from '@/components/states';
import { mediaSrc } from '@/lib/api/media';
import { timeAgo } from '@/lib/format';
import { useTransactions } from '@/lib/hooks/useTransactions';

const STATUS_KIND: Record<
  BarterTransactionView['status'],
  'neutral' | 'success' | 'danger' | 'warning'
> = {
  created: 'neutral',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
  disputed: 'danger',
};

/**
 * User-facing status copy.
 *
 * The API's `in_progress` is a state machine value, not English. Saying
 * "Under way" — and, for `created`, "Not started" — tells someone what is
 * true rather than what the column contains.
 */
const STATUS_LABEL: Record<BarterTransactionView['status'], string> = {
  created: 'Not started',
  in_progress: 'Under way',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export default function TransactionsScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const transactions = useTransactions();
  const items = transactions.data ?? [];
  const open = items.filter((t) => t.status === 'created' || t.status === 'in_progress').length;

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
          title="Transactions"
          subtitle={
            open > 0 ? `${open} still to finish` : 'Trades you have agreed with other members.'
          }
          back
        />
      </View>

      <GroupedList
        data={items}
        keyExtractor={(t) => t.id}
        showsVerticalScrollIndicator={false}
        separatorInset={spacing.lg + 40 + spacing.md}
        contentContainerStyle={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.md,
          paddingBottom: layout.tabBarInset,
          flexGrow: 1,
        }}
        renderItem={({ item }) => (
          <ListRow
            leading={
              <Avatar
                name={item.counterparty.displayName}
                size={40}
                uri={mediaSrc(item.counterparty.avatarUrl)}
              />
            }
            title={item.counterparty.displayName}
            subtitle={`${item.youGave.title} ↔ ${item.youGot.title}`}
            meta={timeAgo(item.updatedAt)}
            // An unfinished trade is the one that needs a decision from you.
            emphasis={item.status === 'in_progress'}
            trailing={
              <Badge label={STATUS_LABEL[item.status]} kind={STATUS_KIND[item.status]} dot />
            }
            chevron={<Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
            onPress={() => router.push(`/(app)/transaction/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          transactions.isPending ? (
            <SkeletonList count={3} />
          ) : transactions.isError ? (
            <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
          ) : (
            <EmptyState
              art={<ObjectCluster left="guitar" right="watch" icon="repeat" />}
              icon={<Ionicons name="repeat-outline" size={22} color={colors.textSecondary} />}
              title="No trades yet"
              body="A transaction is created the moment an offer is accepted — this is where you track it through to done."
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
