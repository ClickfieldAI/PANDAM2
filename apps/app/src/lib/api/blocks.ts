import { type BlockedUserView } from '@pandam/types';

import { api } from './client';

/** People the signed-in user has blocked. Server state only; the other direction is never exposed. */
export const blocksApi = {
  list: () => api.get<{ items: BlockedUserView[] }>('/api/v1/blocks'),
  block: (userId: string) =>
    api.put<{ blocked: boolean; userId: string; withdrawnOffers: number }>(
      `/api/v1/blocks/${userId}`,
      {},
    ),
  unblock: (userId: string) =>
    api.delete<{ blocked: boolean; userId: string }>(`/api/v1/blocks/${userId}`),
};
