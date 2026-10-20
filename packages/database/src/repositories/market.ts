/**
 * Read model for discovery. Cross-entity JOIN queries (listing/need + owner +
 * category) live here so the plain `listings` / `needs` repos stay simple CRUD.
 * Every result carries only the *public* slice of the owner.
 *
 * Listings additionally carry `pricing` (transaction type + price); needs never
 * do — a need is a request, never itself for sale. That asymmetry is real, so
 * listings and needs use separate select shapes rather than forcing one
 * generic shape to fit both.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';

import { type ItemType, type PublicationStatus, type TransactionType } from '../enums';
import { categories } from '../schema/categories';
import { listingImages } from '../schema/listing-images';
import { listings } from '../schema/listings';
import { needImages } from '../schema/need-images';
import { needs } from '../schema/needs';
import { profiles } from '../schema/profiles';

import { type Database, firstOrNull, ownerIsActive } from './helpers';

export interface OwnerRef {
  id: string;
  displayName: string;
  username: string | null;
  /** Coarse city from the owner's profile; `null` when they have not set one. */
  locationCity: string | null;
  /** R2 key of their avatar; the Worker turns this into a URL. */
  avatarKey: string | null;
}
export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}
/** One photo attached to a listing. The URL is built by the Worker. */
export interface ImageRef {
  id: string;
  objectKey: string;
  sortOrder: number;
}
export interface PricingRef {
  transactionType: TransactionType;
  priceAmount: number | null;
  priceCurrency: string;
}

export interface ListingWithRefs {
  id: string;
  ownerId: string;
  categoryId: string;
  type: ItemType;
  title: string;
  description: string;
  status: PublicationStatus;
  createdAt: number;
  updatedAt: number;
  owner: OwnerRef;
  category: CategoryRef;
  pricing: PricingRef;
  /** Ordered photos; empty when the owner has not uploaded any. */
  images: ImageRef[];
}

export interface NeedWithRefs {
  id: string;
  ownerId: string;
  categoryId: string;
  type: ItemType;
  title: string;
  description: string;
  status: PublicationStatus;
  createdAt: number;
  updatedAt: number;
  owner: OwnerRef;
  category: CategoryRef;
  /** Ordered reference photos; empty when the owner has not uploaded any. */
  images: ImageRef[];
}

export interface DiscoverFilters {
  categoryId?: string;
  type?: ItemType;
  q?: string;
  ownerId?: string;
  limit: number;
  cursor?: { createdAt: number; id: string } | undefined;
  /** Listings only: exclude `sale`-only rows (used by reciprocal matching — a
   *  sale-only listing has nothing to trade back). */
  barterableOnly?: boolean;
  /** Coarse location filter, matched case-insensitively against the owner's
   *  profile city. Barter means meeting in person, so "near me" is a city
   *  match rather than a radius — no coordinates are stored anywhere. */
  city?: string;
  /** Owners whose items must not appear (people the viewer blocked or who blocked the viewer). */
  excludeOwnerIds?: string[];
  /** Epoch ms — only rows with `createdAt >= since`. Home's recency filter;
   *  Discover (the full active marketplace) never sets this. */
  since?: number;
}

/** Escape LIKE wildcards in user input; used with `ESCAPE '\'`. */
function likeArg(q: string): string {
  return `%${q
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/* -------------------------------------------------------------------------- */
/* Needs — no pricing                                                         */
/* -------------------------------------------------------------------------- */

const needSelectShape = {
  id: needs.id,
  ownerId: needs.ownerId,
  categoryId: needs.categoryId,
  type: needs.type,
  title: needs.title,
  description: needs.description,
  status: needs.status,
  createdAt: needs.createdAt,
  updatedAt: needs.updatedAt,
  ownerDisplayName: profiles.displayName,
  ownerUsername: profiles.username,
  ownerLocationCity: profiles.locationCity,
  ownerAvatarKey: profiles.avatarKey,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

type NeedFlat = {
  id: string;
  ownerId: string;
  categoryId: string;
  type: ItemType;
  title: string;
  description: string;
  status: PublicationStatus;
  createdAt: number;
  updatedAt: number;
  ownerDisplayName: string;
  ownerUsername: string | null;
  ownerLocationCity: string | null;
  ownerAvatarKey: string | null;
  categoryName: string;
  categorySlug: string;
};

function inflateNeed(r: NeedFlat, images: ImageRef[] = []): NeedWithRefs {
  return {
    id: r.id,
    ownerId: r.ownerId,
    categoryId: r.categoryId,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    owner: {
      id: r.ownerId,
      displayName: r.ownerDisplayName,
      username: r.ownerUsername,
      locationCity: r.ownerLocationCity,
      avatarKey: r.ownerAvatarKey,
    },
    category: { id: r.categoryId, name: r.categoryName, slug: r.categorySlug },
    images,
  };
}

/* -------------------------------------------------------------------------- */
/* Listings — with pricing                                                    */
/* -------------------------------------------------------------------------- */

const listingSelectShape = {
  id: listings.id,
  ownerId: listings.ownerId,
  categoryId: listings.categoryId,
  type: listings.type,
  title: listings.title,
  description: listings.description,
  status: listings.status,
  transactionType: listings.transactionType,
  priceAmount: listings.priceAmount,
  priceCurrency: listings.priceCurrency,
  createdAt: listings.createdAt,
  updatedAt: listings.updatedAt,
  ownerDisplayName: profiles.displayName,
  ownerUsername: profiles.username,
  ownerLocationCity: profiles.locationCity,
  ownerAvatarKey: profiles.avatarKey,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

type ListingFlat = NeedFlat & {
  transactionType: TransactionType;
  priceAmount: number | null;
  priceCurrency: string;
};

function inflateListing(r: ListingFlat, images: ImageRef[] = []): ListingWithRefs {
  return {
    ...inflateNeed(r),
    pricing: {
      transactionType: r.transactionType,
      priceAmount: r.priceAmount,
      priceCurrency: r.priceCurrency,
    },
    images,
  };
}

export function marketRepository(db: Database) {
  /**
   * Photos for a page of listings in one query, so the feed costs two
   * round-trips regardless of how many cards it returns.
   */
  async function imagesFor(listingIds: string[]): Promise<Map<string, ImageRef[]>> {
    const map = new Map<string, ImageRef[]>();
    if (listingIds.length === 0) return map;
    const rows = await db
      .select({
        id: listingImages.id,
        listingId: listingImages.listingId,
        objectKey: listingImages.objectKey,
        sortOrder: listingImages.sortOrder,
      })
      .from(listingImages)
      .where(inArray(listingImages.listingId, listingIds))
      .orderBy(asc(listingImages.sortOrder), asc(listingImages.id));
    for (const r of rows) {
      const ref: ImageRef = { id: r.id, objectKey: r.objectKey, sortOrder: r.sortOrder };
      const list = map.get(r.listingId);
      if (list) list.push(ref);
      else map.set(r.listingId, [ref]);
    }
    return map;
  }

  /** Inflate listing rows with their photos attached. */
  async function withImages(rows: ListingFlat[]): Promise<ListingWithRefs[]> {
    const byListing = await imagesFor(rows.map((r) => r.id));
    return rows.map((r) => inflateListing(r, byListing.get(r.id) ?? []));
  }

  /** Same as `imagesFor`, for a page of needs. */
  async function needImagesForIds(needIds: string[]): Promise<Map<string, ImageRef[]>> {
    const map = new Map<string, ImageRef[]>();
    if (needIds.length === 0) return map;
    const rows = await db
      .select({
        id: needImages.id,
        needId: needImages.needId,
        objectKey: needImages.objectKey,
        sortOrder: needImages.sortOrder,
      })
      .from(needImages)
      .where(inArray(needImages.needId, needIds))
      .orderBy(asc(needImages.sortOrder), asc(needImages.id));
    for (const r of rows) {
      const ref: ImageRef = { id: r.id, objectKey: r.objectKey, sortOrder: r.sortOrder };
      const list = map.get(r.needId);
      if (list) list.push(ref);
      else map.set(r.needId, [ref]);
    }
    return map;
  }

  /** Inflate need rows with their reference photos attached. */
  async function withNeedImages(rows: NeedFlat[]): Promise<NeedWithRefs[]> {
    const byNeed = await needImagesForIds(rows.map((r) => r.id));
    return rows.map((r) => inflateNeed(r, byNeed.get(r.id) ?? []));
  }

  return {
    async discoverListings(f: DiscoverFilters): Promise<ListingWithRefs[]> {
      const where = [eq(listings.status, 'published'), ownerIsActive(listings.ownerId)];
      if (f.categoryId) where.push(eq(listings.categoryId, f.categoryId));
      if (f.type) where.push(eq(listings.type, f.type));
      if (f.ownerId) where.push(eq(listings.ownerId, f.ownerId));
      if (f.excludeOwnerIds?.length) where.push(notInArray(listings.ownerId, f.excludeOwnerIds));
      if (f.barterableOnly) where.push(sql`${listings.transactionType} <> 'sale'`);
      if (f.city && f.city.trim()) {
        where.push(sql`lower(${profiles.locationCity}) = ${f.city.trim().toLowerCase()}`);
      }
      if (f.since !== undefined) where.push(gte(listings.createdAt, f.since));
      if (f.q && f.q.trim()) {
        const arg = likeArg(f.q);
        where.push(
          sql`(lower(${listings.title}) like ${arg} escape '\\' or lower(${listings.description}) like ${arg} escape '\\')`,
        );
      }
      if (f.cursor) {
        where.push(
          or(
            lt(listings.createdAt, f.cursor.createdAt),
            and(eq(listings.createdAt, f.cursor.createdAt), lt(listings.id, f.cursor.id)),
          )!,
        );
      }
      const rows = (await db
        .select(listingSelectShape)
        .from(listings)
        .innerJoin(profiles, eq(profiles.userId, listings.ownerId))
        .innerJoin(categories, eq(categories.id, listings.categoryId))
        .where(and(...where))
        .orderBy(desc(listings.createdAt), desc(listings.id))
        .limit(f.limit)) as ListingFlat[];
      return withImages(rows);
    },

    async discoverNeeds(f: DiscoverFilters): Promise<NeedWithRefs[]> {
      const where = [eq(needs.status, 'published'), ownerIsActive(needs.ownerId)];
      if (f.categoryId) where.push(eq(needs.categoryId, f.categoryId));
      if (f.type) where.push(eq(needs.type, f.type));
      if (f.ownerId) where.push(eq(needs.ownerId, f.ownerId));
      if (f.excludeOwnerIds?.length) where.push(notInArray(needs.ownerId, f.excludeOwnerIds));
      if (f.city && f.city.trim()) {
        where.push(sql`lower(${profiles.locationCity}) = ${f.city.trim().toLowerCase()}`);
      }
      if (f.since !== undefined) where.push(gte(needs.createdAt, f.since));
      if (f.q && f.q.trim()) {
        const arg = likeArg(f.q);
        where.push(
          sql`(lower(${needs.title}) like ${arg} escape '\\' or lower(${needs.description}) like ${arg} escape '\\')`,
        );
      }
      if (f.cursor) {
        where.push(
          or(
            lt(needs.createdAt, f.cursor.createdAt),
            and(eq(needs.createdAt, f.cursor.createdAt), lt(needs.id, f.cursor.id)),
          )!,
        );
      }
      const rows = (await db
        .select(needSelectShape)
        .from(needs)
        .innerJoin(profiles, eq(profiles.userId, needs.ownerId))
        .innerJoin(categories, eq(categories.id, needs.categoryId))
        .where(and(...where))
        .orderBy(desc(needs.createdAt), desc(needs.id))
        .limit(f.limit)) as NeedFlat[];
      return withNeedImages(rows);
    },

    async listOwnerListings(ownerId: string): Promise<ListingWithRefs[]> {
      const rows = (await db
        .select(listingSelectShape)
        .from(listings)
        .innerJoin(profiles, eq(profiles.userId, listings.ownerId))
        .innerJoin(categories, eq(categories.id, listings.categoryId))
        .where(and(eq(listings.ownerId, ownerId), isNull(listings.deletedAt)))
        .orderBy(desc(listings.createdAt), desc(listings.id))) as ListingFlat[];
      return withImages(rows);
    },

    async listOwnerNeeds(ownerId: string): Promise<NeedWithRefs[]> {
      const rows = (await db
        .select(needSelectShape)
        .from(needs)
        .innerJoin(profiles, eq(profiles.userId, needs.ownerId))
        .innerJoin(categories, eq(categories.id, needs.categoryId))
        .where(and(eq(needs.ownerId, ownerId), isNull(needs.deletedAt)))
        .orderBy(desc(needs.createdAt), desc(needs.id))) as NeedFlat[];
      return withNeedImages(rows);
    },

    async getListing(id: string): Promise<ListingWithRefs | null> {
      const rows = (await db
        .select(listingSelectShape)
        .from(listings)
        .innerJoin(profiles, eq(profiles.userId, listings.ownerId))
        .innerJoin(categories, eq(categories.id, listings.categoryId))
        .where(eq(listings.id, id))
        .limit(1)) as ListingFlat[];
      const row = firstOrNull(rows);
      if (!row) return null;
      const [withRefs] = await withImages([row]);
      return withRefs ?? null;
    },

    async getNeed(id: string): Promise<NeedWithRefs | null> {
      const rows = (await db
        .select(needSelectShape)
        .from(needs)
        .innerJoin(profiles, eq(profiles.userId, needs.ownerId))
        .innerJoin(categories, eq(categories.id, needs.categoryId))
        .where(eq(needs.id, id))
        .limit(1)) as NeedFlat[];
      const row = firstOrNull(rows);
      if (!row) return null;
      const [withRefs] = await withNeedImages([row]);
      return withRefs ?? null;
    },

    async listingsByIds(ids: string[]): Promise<Map<string, ListingWithRefs>> {
      const map = new Map<string, ListingWithRefs>();
      if (ids.length === 0) return map;
      const rows = (await db
        .select(listingSelectShape)
        .from(listings)
        .innerJoin(profiles, eq(profiles.userId, listings.ownerId))
        .innerJoin(categories, eq(categories.id, listings.categoryId))
        .where(inArray(listings.id, ids))) as ListingFlat[];
      for (const r of await withImages(rows)) map.set(r.id, r);
      return map;
    },

    async needsByIds(ids: string[]): Promise<Map<string, NeedWithRefs>> {
      const map = new Map<string, NeedWithRefs>();
      if (ids.length === 0) return map;
      const rows = (await db
        .select(needSelectShape)
        .from(needs)
        .innerJoin(profiles, eq(profiles.userId, needs.ownerId))
        .innerJoin(categories, eq(categories.id, needs.categoryId))
        .where(inArray(needs.id, ids))) as NeedFlat[];
      for (const r of await withNeedImages(rows)) map.set(r.id, r);
      return map;
    },

    /**
     * Cities that currently have published listings, most-stocked first —
     * the source for the discover screen's location filter, so it can only
     * ever offer places that actually have something in them.
     */
    async citiesWithListings(limit = 40): Promise<{ city: string; count: number }[]> {
      const rows = await db
        .select({ city: profiles.locationCity, n: sql<number>`count(*)` })
        .from(listings)
        .innerJoin(profiles, eq(profiles.userId, listings.ownerId))
        .where(
          and(
            eq(listings.status, 'published'),
            ownerIsActive(listings.ownerId),
            sql`${profiles.locationCity} is not null`,
          ),
        )
        .groupBy(profiles.locationCity)
        .orderBy(sql`count(*) desc`)
        .limit(limit);
      return rows
        .filter((r): r is { city: string; n: number } => !!r.city)
        .map((r) => ({ city: r.city, count: Number(r.n) }));
    },

    /** Published-item counts for a user (home / profile headers). */
    async ownerCounts(ownerId: string): Promise<{ listings: number; needs: number }> {
      const [l, n] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)` })
          .from(listings)
          .where(and(eq(listings.ownerId, ownerId), eq(listings.status, 'published'))),
        db
          .select({ n: sql<number>`count(*)` })
          .from(needs)
          .where(and(eq(needs.ownerId, ownerId), eq(needs.status, 'published'))),
      ]);
      return { listings: Number(l[0]?.n ?? 0), needs: Number(n[0]?.n ?? 0) };
    },
  };
}

export type MarketRepository = ReturnType<typeof marketRepository>;
