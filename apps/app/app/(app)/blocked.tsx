import { View } from 'react-native';

import {
  Avatar,
  Button,
  EmptyState,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  spacing,
  useToast,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/lib/api/client';
import { mediaSrc } from '@/lib/api/media';
import { timeAgo } from '@/lib/format';
import { useBlockedUsers, useUnblockUser } from '@/lib/hooks/useBlocks';

/**
 * The people you have blocked. Only you can see this list — the person you
 * blocked is never told, and nothing here reveals whether someone has blocked you.
 */
export default function BlockedPeopleScreen() {
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();
  const toast = useToast();

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
        <AppHeader
          title="Blocked people"
          subtitle="They cannot message you or trade with you, and you will not see each other's listings."
          back
        />

        {blocked.isPending ? (
          <SkeletonList count={2} />
        ) : blocked.isError ? (
          <ErrorState error={blocked.error} onRetry={() => void blocked.refetch()} />
        ) : (blocked.data ?? []).length === 0 ? (
          <EmptyState
            title="You have not blocked anyone"
            body="If someone is bothering you, report them from a chat or a trade and block them there."
          />
        ) : (
          <Stack gap="md">
            {blocked.data!.map((b) => (
              <Row key={b.user.id} justify="space-between" align="center">
                <Row gap="md" align="center" style={{ flexShrink: 1 }}>
                  <Avatar name={b.user.displayName} size={44} uri={mediaSrc(b.user.avatarUrl)} />
                  <View style={{ flexShrink: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {b.user.displayName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      Blocked {timeAgo(b.blockedAt)}
                    </Text>
                  </View>
                </Row>
                <Button
                  label="Unblock"
                  variant="secondary"
                  size="sm"
                  loading={unblock.isPending && unblock.variables === b.user.id}
                  onPress={() =>
                    unblock.mutate(b.user.id, {
                      onSuccess: () => toast.success(`${b.user.displayName} is unblocked.`),
                      onError: (e) =>
                        toast.error(e instanceof ApiError ? e.message : 'Could not unblock.'),
                    })
                  }
                />
              </Row>
            ))}
          </Stack>
        )}
      </View>
    </Screen>
  );
}
