import { and, desc, eq } from 'drizzle-orm';

import { newId } from '../id';
import { type PublicationStatus } from '../schema/_shared';
import { type ListingRow, type NewListingRow, listings } from '../schema/listings';

import { type Database, firstOrNull, one, touch, ownerIsActive } from './helpers';

export type CreateListingInput = Omit<
  NewListingRow,
  'id' | 'status' | 'createdAt' | 'updatedAt'
> & { status?: PublicationStatus };

export type UpdateListingInput = Partial<
  Pick<
    NewListingRow,
    | 'categoryId'
    | 'type'
    | 'title'
    | 'description'
    | 'transactionType'
    | 'priceAmount'
    | 'priceCurrency'
  >
>;

export function listingsRepository(db: Database) {
  return {
    async create(input: CreateListingInput): Promise<ListingRow> {
      const rows = await db
        .insert(listings)
        .values({ ...input, id: newId('listing') })
        .returning();
      return one(rows, 'listings.create');
    },

    async findById(id: string): Promise<ListingRow | null> {
      const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
      return firstOrNull(rows);
    },

    async listByOwner(ownerId: string): Promise<ListingRow[]> {
      return db
        .select()
        .from(listings)
        .where(eq(listings.ownerId, ownerId))
        .orderBy(desc(listings.createdAt));
    },

    async update(id: string, patch: UpdateListingInput): Promise<ListingRow | null> {
      const rows = await db
        .update(listings)
        .set({ ...patch, ...touch() })
        .where(eq(listings.id, id))
        .returning();
      return firstOrNull(rows);
    },

    async setStatus(id: string, status: PublicationStatus): Promise<ListingRow | null> {
      const rows = await db
        .update(listings)
        .set({ status, ...touch() })
        .where(eq(listings.id, id))
        .returning();
      return firstOrNull(rows);
    },

    /** Every published listing — the discovery/matching read path. */
    async listAllPublished(): Promise<ListingRow[]> {
      return db
        .select()
        .from(listings)
        .where(and(eq(listings.status, 'published'), ownerIsActive(listings.ownerId)));
    },

    /** Published listings in a category+type — the matching read path. */
    async listPublishedByCategoryType(
      categoryId: string,
      type: ListingRow['type'],
    ): Promise<ListingRow[]> {
      return db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.status, 'published'),
            ownerIsActive(listings.ownerId),
            eq(listings.categoryId, categoryId),
            eq(listings.type, type),
          ),
        );
    },
  };
}

export type ListingsRepository = ReturnType<typeof listingsRepository>;
