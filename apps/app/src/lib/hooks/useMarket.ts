/**
 * TanStack Query hooks for listings ("I HAVE") and needs ("I NEED").
 * `kind` selects which. Mutations invalidate the affected caches.
 */
import { type MarketItem } from '@pandam/types';
import {
  type CreateListingInput,
  type CreateNeedInput,
  type UpdateListingInput,
} from '@pandam/validation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type MarketKind, marketApi, recommendationsApi } from '@/lib/api/market';
import { qk } from '@/lib/query/keys';

export type DiscoverParams = {
  category?: string;
  type?: MarketItem['type'];
  q?: string;
  owner?: string;
  /** Coarse city match against the owner's profile. */
  city?: string;
  limit?: number;
  /** Epoch ms — only items created at or after this instant (Home's "Fresh
   *  near you" recency filter; Discover never sets this). */
  since?: number;
};

export function useDiscover(kind: MarketKind, params: DiscoverParams) {
  return useInfiniteQuery({
    queryKey: qk.market.discover(kind, params),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => marketApi.discover(kind, { ...params, cursor: pageParam ?? null }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 20_000,
  });
}

/**
 * Cities with published listings, for the discover filter. Cached for a while:
 * the set of cities changes far more slowly than the listings in them.
 */
export function useListingCities() {
  return useQuery({
    queryKey: qk.market.cities,
    queryFn: async () => (await marketApi.cities()).items,
    staleTime: 5 * 60_000,
  });
}

/**
 * "Recommended For You" — the Behavior-Based Recommendation Engine's output.
 * Same staleness window as `useDiscover`: personalized ranking shifts with
 * fresh activity, but not fast enough to need anything shorter.
 */
export function useRecommendations(limit = 10) {
  return useQuery({
    queryKey: qk.recommendations(limit),
    queryFn: () => recommendationsApi.list(limit),
    staleTime: 20_000,
  });
}

export function useMyItems(kind: MarketKind, enabled = true) {
  return useQuery({
    queryKey: qk.market.mine(kind),
    queryFn: async () => (await marketApi.mine(kind)).items,
    enabled,
    staleTime: 15_000,
  });
}

export function useItem(kind: MarketKind, id: string | undefined) {
  return useQuery({
    queryKey: qk.market.detail(kind, id ?? ''),
    queryFn: async () => (await marketApi.get(kind, id!)).item,
    enabled: !!id,
  });
}

export function useCreateItem(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateListingInput | CreateNeedInput) => marketApi.create(kind, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
      void client.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useUpdateItem(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateListingInput }) =>
      marketApi.update(kind, id, patch),
    onSuccess: (res) => {
      client.setQueryData(qk.market.detail(kind, res.item.id), res.item);
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
      void client.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useDeleteItem(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => marketApi.remove(kind, id),
    onSuccess: (_res, id) => {
      client.removeQueries({ queryKey: qk.market.detail(kind, id) });
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
      void client.invalidateQueries({ queryKey: qk.offers.all });
      void client.invalidateQueries({ queryKey: ['favourites'] });
      void client.invalidateQueries({ queryKey: qk.matches });
    },
  });
}

export function useSetItemStatus(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MarketItem['status'] }) =>
      marketApi.setStatus(kind, id, { status }),
    onSuccess: (res) => {
      client.setQueryData(qk.market.detail(kind, res.item.id), res.item);
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
      void client.invalidateQueries({ queryKey: qk.matches });
    },
  });
}
