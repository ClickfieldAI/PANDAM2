/**
 * Photo upload mutations.
 *
 * Uploads are sequential rather than parallel (`for … await`): a phone on a
 * weak connection sending six full-resolution photos at once tends to time
 * the whole batch out, and a partial failure is much easier to report when
 * you know exactly how many got through.
 */
import { type ItemImage } from '@pandam/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type MarketKind } from '@/lib/api/market';
import { mediaApi } from '@/lib/api/media';
import { applySavedProfile } from '@/lib/auth/profile';
import { qk } from '@/lib/query/keys';

/** Upload several local photos to one listing or need, reporting how many landed. */
export function useUploadItemImages(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, uris }: { itemId: string; uris: string[] }) => {
      const uploaded: ItemImage[] = [];
      for (const uri of uris) {
        const { image } = await mediaApi.uploadItemImage(kind, itemId, uri);
        uploaded.push(image);
      }
      return uploaded;
    },
    onSuccess: (_images, { itemId }) => {
      void client.invalidateQueries({ queryKey: qk.market.detail(kind, itemId) });
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
    },
  });
}

export function useDeleteItemImage(kind: MarketKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, imageId }: { itemId: string; imageId: string }) =>
      mediaApi.deleteItemImage(kind, itemId, imageId),
    onSuccess: (_res, { itemId }) => {
      void client.invalidateQueries({ queryKey: qk.market.detail(kind, itemId) });
      void client.invalidateQueries({ queryKey: qk.market.all(kind) });
    },
  });
}

export function useUploadAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (uri: string) => mediaApi.uploadAvatar(uri),
    onSuccess: ({ profile }) => applySavedProfile(client, profile),
  });
}
