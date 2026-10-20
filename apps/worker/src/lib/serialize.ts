/**
 * Row -> API shape mappers. The ONLY place a DB row becomes a response body, so
 * secrets (password hashes, token hashes) can never leak by accident: these
 * functions simply do not copy those fields.
 */
import {
  type ListingWithRefs,
  type NeedWithRefs,
  type OwnerRef as DbOwnerRef,
} from '@pandam/database';
import {
  type MarketItem,
  type OwnerRef,
  type Profile,
  type PublicProfile,
  type SafeUser,
  type User,
} from '@pandam/types';

import { mediaUrl } from './media';

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    identityVerification: {
      status: user.identityVerificationStatus,
      governmentId: user.governmentIdVerifiedAt ? 'verified' : 'not_started',
      face: user.faceVerifiedAt ? 'verified' : 'not_started',
    },
  };
}

/**
 * The public slice of a user, built from their profile. Used by every view
 * that shows "who" (offers, chats, transactions, reviews) so a missing
 * profile degrades the same way everywhere instead of per route.
 */
export function toOwnerRef(
  userId: string,
  profile: Pick<Profile, 'displayName' | 'username' | 'locationCity' | 'avatarKey'> | null,
): OwnerRef {
  return {
    id: userId,
    displayName: profile?.displayName ?? 'PANDAM user',
    username: profile?.username ?? null,
    locationCity: profile?.locationCity ?? null,
    avatarUrl: toMediaUrl(profile?.avatarKey ?? null),
  };
}

/** Public URL for a stored object, or `null` when there is no object. */
export function toMediaUrl(objectKey: string | null): string | null {
  return objectKey ? mediaUrl(objectKey) : null;
}

/**
 * An item's cover photo — its first uploaded image, in `sortOrder` — resolved
 * to a fetchable URL, or `null` when it has none. The one place that decides
 * "which image represents this item" so every `ItemRef` (offers, matches,
 * transactions) agrees with the listing's own detail page instead of each
 * screen picking its own convention.
 */
export function coverImageUrl(item: unknown): string | null {
  const images =
    item && typeof item === 'object' && 'images' in item
      ? (item as { images?: { objectKey: string; sortOrder: number }[] }).images
      : undefined;
  const first = images ? [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0] : undefined;
  return first ? mediaUrl(first.objectKey) : null;
}

export function toPublicProfile(profile: Profile | null): PublicProfile | null {
  if (!profile) return null;
  return {
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    avatarKey: profile.avatarKey,
    avatarUrl: toMediaUrl(profile.avatarKey),
    locationCity: profile.locationCity,
    locationRegion: profile.locationRegion,
    locationCountry: profile.locationCountry,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

/**
 * The read model hands back the owner's avatar KEY; the API only ever exposes
 * a URL. That swap happens here, so no screen ever sees a storage key.
 */
export function toOwner(owner: DbOwnerRef): OwnerRef {
  return {
    id: owner.id,
    displayName: owner.displayName,
    username: owner.username,
    locationCity: owner.locationCity,
    avatarUrl: toMediaUrl(owner.avatarKey),
  };
}

export function toMarketItem(
  row: ListingWithRefs | NeedWithRefs,
  kind: 'listing' | 'need',
  viewCount?: number,
): MarketItem {
  return {
    id: row.id,
    kind,
    ownerId: row.ownerId,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owner: toOwner(row.owner),
    category: row.category,
    ...(viewCount !== undefined ? { viewCount } : {}),
    // Only a listing carries pricing and photos — a need is a request, so it
    // is never itself for sale and has nothing of its own to photograph.
    ...('pricing' in row ? { pricing: row.pricing } : {}),
    ...('images' in row
      ? {
          images: row.images.map((img) => ({
            id: img.id,
            url: mediaUrl(img.objectKey),
            sortOrder: img.sortOrder,
          })),
        }
      : {}),
  };
}
