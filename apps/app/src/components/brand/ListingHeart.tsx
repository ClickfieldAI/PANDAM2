import { type MarketItem } from '@pandam/types';

import { useSession } from '@/lib/auth/hooks';
import { useFavouriteIds, useToggleFavourite } from '@/lib/hooks/useFavourites';

import { SaveHeart } from './SaveHeart';

/**
 * The save heart for a listing, wired to the real favourites API. It renders
 * nothing where saving makes no sense: requests ("I NEED"), your own items,
 * the showcase items that exist only in the client, or a listing that is no
 * longer available (unless it is already saved, so it can still be removed).
 */
export function ListingHeart({ item, size }: { item: MarketItem; size?: number }) {
  const { user } = useSession();
  const ids = useFavouriteIds();
  const toggle = useToggleFavourite();

  if (item.kind !== 'listing' || item.id.startsWith('demo-')) return null;
  if (user && item.ownerId === user.id) return null;
  const saved = (ids.data ?? []).includes(item.id);
  if (item.status !== 'published' && !saved) return null;

  return (
    <SaveHeart
      size={size}
      saved={saved}
      onToggle={() => toggle.mutate({ listingId: item.id, save: !saved })}
    />
  );
}
