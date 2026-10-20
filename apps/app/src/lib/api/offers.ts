import { type OfferView } from '@pandam/types';
import { type CounterOfferInput, type CreateOfferInput } from '@pandam/validation';

import { api } from './client';

export type OfferAction = 'accept' | 'reject' | 'cancel';

export const offersApi = {
  create: (input: CreateOfferInput) => api.post<{ offer: OfferView }>('/api/v1/offers', input),
  incoming: (status?: string) =>
    api.get<{ items: OfferView[] }>(`/api/v1/offers/incoming${status ? `?status=${status}` : ''}`),
  outgoing: (status?: string) =>
    api.get<{ items: OfferView[] }>(`/api/v1/offers/outgoing${status ? `?status=${status}` : ''}`),
  get: (id: string) => api.get<{ offer: OfferView }>(`/api/v1/offers/${id}`),
  counter: (id: string, input: CounterOfferInput) =>
    api.post<{ offer: OfferView }>(`/api/v1/offers/${id}/counter`, input),
  history: (id: string) => api.get<{ items: OfferView[] }>(`/api/v1/offers/${id}/history`),
  respond: (id: string, action: OfferAction) =>
    api.post<{ offer: OfferView }>(`/api/v1/offers/${id}/respond`, { action }),
};
