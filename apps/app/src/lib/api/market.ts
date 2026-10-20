/**
 * Listings ("I HAVE") and needs ("I NEED"). Identical endpoints, one module
 * parameterised by `kind`.
 */
import { type MarketItem, type Paginated, type RecommendedItem } from '@pandam/types';
import {
  type CreateListingInput,
  type CreateNeedInput,
  type DiscoverQuery,
  type UpdateListingInput,
} from '@pandam/validation';

import { api } from './client';

export type MarketKind = 'listing' | 'need';
type CreateInput = CreateListingInput | CreateNeedInput;
type UpdateInput = UpdateListingInput;
type StatusInput = {
  status: 'draft' | 'published' | 'paused' | 'sold' | 'traded' | 'archived';
};

export type DiscoverParams = Partial<Omit<DiscoverQuery, 'cursor'>> & {
  cursor?: string | null;
};

const base = (kind: MarketKind) => (kind === 'listing' ? '/api/v1/listings' : '/api/v1/needs');

function toQuery(params: DiscoverParams): string {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.type) q.set('type', params.type);
  if (params.q) q.set('q', params.q);
  if (params.owner) q.set('owner', params.owner);
  if (params.city) q.set('city', params.city);
  if (params.since) q.set('since', String(params.since));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const marketApi = {
  discover: (kind: MarketKind, params: DiscoverParams = {}) =>
    api.get<Paginated<MarketItem>>(`${base(kind)}${toQuery(params)}`),

  mine: (kind: MarketKind) => api.get<{ items: MarketItem[] }>(`${base(kind)}/mine`),

  /** Cities that currently have published listings, most-stocked first. */
  cities: () => api.get<{ items: { city: string; count: number }[] }>('/api/v1/listings/cities'),

  get: (kind: MarketKind, id: string) => api.get<{ item: MarketItem }>(`${base(kind)}/${id}`),

  create: (kind: MarketKind, input: CreateInput) =>
    api.post<{ item: MarketItem }>(base(kind), input),

  update: (kind: MarketKind, id: string, patch: UpdateInput) =>
    api.patch<{ item: MarketItem }>(`${base(kind)}/${id}`, patch),

  /** Delete an item you own. `deleted` = gone for good; `archived` = hidden but kept for trade history. */
  remove: (kind: MarketKind, id: string) =>
    api.delete<{ deleted: boolean; outcome: 'deleted' | 'archived'; withdrawnOffers: number }>(
      `${base(kind)}/${id}`,
    ),

  setStatus: (kind: MarketKind, id: string, body: StatusInput) =>
    api.post<{ item: MarketItem }>(`${base(kind)}/${id}/status`, body),
};

/**
 * Behavior-Based Recommendation Engine — "Recommended For You". Separate
 * from `marketApi` because it is read-only and single-shape (listings only,
 * never needs), not because it is a parallel system: the server reuses the
 * exact same listing rows and availability rules as `marketApi.discover`.
 */
export const recommendationsApi = {
  list: (limit = 10) =>
    api.get<{ items: RecommendedItem[]; personalized: boolean }>(
      `/api/v1/recommendations?limit=${limit}`,
    ),
};
