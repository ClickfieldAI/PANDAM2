/**
 * Saved listings. The server is the source of truth: the set of saved ids is
 * one cached query every heart reads, a tap updates it optimistically, and the
 * change is rolled back (with an error toast) if the server refuses it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@pandam/ui';

import { ApiError } from '@/lib/api/client';
import { favouritesApi } from '@/lib/api/favourites';
import { useSession } from '@/lib/auth/hooks';
import { qk } from '@/lib/query/keys';

export function useFavouriteIds() {
  const { isAuthenticated } = useSession();
  return useQuery({
    queryKey: qk.favourites.ids,
    queryFn: async () => (await favouritesApi.ids()).ids,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

export function useFavourites() {
  return useQuery({
    queryKey: qk.favourites.list,
    queryFn: async () => (await favouritesApi.list()).items,
  });
}

export function useToggleFavourite() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ listingId, save }: { listingId: string; save: boolean }) =>
      save ? favouritesApi.save(listingId) : favouritesApi.unsave(listingId),
    onMutate: async ({ listingId, save }) => {
      await client.cancelQueries({ queryKey: qk.favourites.ids });
      const previous = client.getQueryData<string[]>(qk.favourites.ids) ?? [];
      client.setQueryData<string[]>(
        qk.favourites.ids,
        save
          ? [listingId, ...previous.filter((id) => id !== listingId)]
          : previous.filter((id) => id !== listingId),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      // The server said no (or was unreachable): put the heart back and say so.
      if (context) client.setQueryData(qk.favourites.ids, context.previous);
      toast.error(
        error instanceof ApiError ? error.message : 'Could not update your saved items. Try again.',
      );
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.favourites.ids });
      void client.invalidateQueries({ queryKey: qk.favourites.list });
    },
  });
}
