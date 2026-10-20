import { type BarterTransactionView } from '@pandam/types';

import { api } from './client';

export type TransactionAction = 'start' | 'complete' | 'confirm' | 'cancel';

export const transactionsApi = {
  list: () => api.get<{ items: BarterTransactionView[] }>('/api/v1/transactions'),
  get: (id: string) =>
    api.get<{ transaction: BarterTransactionView }>(`/api/v1/transactions/${id}`),
  setStatus: (id: string, action: TransactionAction) =>
    api.post<{ transaction: BarterTransactionView }>(`/api/v1/transactions/${id}/status`, {
      action,
    }),
};
