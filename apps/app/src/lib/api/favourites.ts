import { type MarketItem } from '@pandam/types';

import { api } from './client';

/** The caller's saved listings. All of this is server state — nothing is kept only on the device. */
export const favouritesApi = {
  ids: () => api.get<{ ids: string[] }>('/api/v1/favourites/ids'),
  list: () => api.get<{ items: MarketItem[] }>('/api/v1/favourites'),
  save: (listingId: string) =>
    api.put<{ saved: boolean; listingId: string }>(`/api/v1/favourites/${listingId}`, {}),
  unsave: (listingId: string) =>
    api.delete<{ saved: boolean; listingId: string }>(`/api/v1/favourites/${listingId}`),
};
