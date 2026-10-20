import { and, desc, eq } from 'drizzle-orm';

import { newId } from '../id';
import { type PublicationStatus } from '../schema/_shared';
import { type NeedRow, type NewNeedRow, needs } from '../schema/needs';

import { type Database, firstOrNull, one, touch, ownerIsActive } from './helpers';

export type CreateNeedInput = Omit<NewNeedRow, 'id' | 'status' | 'createdAt' | 'updatedAt'> & {
  status?: PublicationStatus;
};

export type UpdateNeedInput = Partial<
  Pick<NewNeedRow, 'categoryId' | 'type' | 'title' | 'description'>
>;

export function needsRepository(db: Database) {
  return {
    async create(input: CreateNeedInput): Promise<NeedRow> {
      const rows = await db
        .insert(needs)
        .values({ ...input, id: newId('need') })
        .returning();
      return one(rows, 'needs.create');
    },

    async findById(id: string): Promise<NeedRow | null> {
      const rows = await db.select().from(needs).where(eq(needs.id, id)).limit(1);
      return firstOrNull(rows);
    },

    async listByOwner(ownerId: string): Promise<NeedRow[]> {
      return db
        .select()
        .from(needs)
        .where(eq(needs.ownerId, ownerId))
        .orderBy(desc(needs.createdAt));
    },

    async update(id: string, patch: UpdateNeedInput): Promise<NeedRow | null> {
      const rows = await db
        .update(needs)
        .set({ ...patch, ...touch() })
        .where(eq(needs.id, id))
        .returning();
      return firstOrNull(rows);
    },

    async setStatus(id: string, status: PublicationStatus): Promise<NeedRow | null> {
      const rows = await db
        .update(needs)
        .set({ status, ...touch() })
        .where(eq(needs.id, id))
        .returning();
      return firstOrNull(rows);
    },

    /** Every published need — the discovery/matching read path. */
    async listAllPublished(): Promise<NeedRow[]> {
      return db
        .select()
        .from(needs)
        .where(and(eq(needs.status, 'published'), ownerIsActive(needs.ownerId)));
    },

    /** Published needs in a category+type — the matching read path. */
    async listPublishedByCategoryType(
      categoryId: string,
      type: NeedRow['type'],
    ): Promise<NeedRow[]> {
      return db
        .select()
        .from(needs)
        .where(
          and(
            eq(needs.status, 'published'),
            ownerIsActive(needs.ownerId),
            eq(needs.categoryId, categoryId),
            eq(needs.type, type),
          ),
        );
    },
  };
}

export type NeedsRepository = ReturnType<typeof needsRepository>;
