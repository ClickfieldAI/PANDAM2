/** TanStack Query hooks for blocking. Everything shown comes from the server. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { blocksApi } from '@/lib/api/blocks';
import { qk } from '@/lib/query/keys';

export function useBlockedUsers() {
  return useQuery({
    queryKey: qk.blocks.list,
    queryFn: async () => (await blocksApi.list()).items,
  });
}

/** A block changes what you can see and do everywhere, so refresh every list it can touch. */
function useInvalidateAfterBlockChange() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: qk.blocks.list });
    void client.invalidateQueries({ queryKey: ['market'] });
    void client.invalidateQueries({ queryKey: qk.offers.all });
    void client.invalidateQueries({ queryKey: qk.matches });
    void client.invalidateQueries({ queryKey: ['favourites'] });
    void client.invalidateQueries({ queryKey: qk.conversations.all });
    void client.invalidateQueries({ queryKey: ['recommendations'] });
  };
}

export function useBlockUser() {
  const refresh = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (userId: string) => blocksApi.block(userId),
    onSuccess: refresh,
  });
}

export function useUnblockUser() {
  const refresh = useInvalidateAfterBlockChange();
  return useMutation({
    mutationFn: (userId: string) => blocksApi.unblock(userId),
    onSuccess: refresh,
  });
}
