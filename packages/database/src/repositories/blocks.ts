import { and, desc, eq, or } from 'drizzle-orm';

import { userBlocks } from '../schema/user-blocks';

import { type Database, now } from './helpers';

export interface BlockRelation {
  /** The caller has blocked the other person. */
  iBlocked: boolean;
  /** The other person has blocked the caller. */
  theyBlocked: boolean;
}

export function blocksRepository(db: Database) {
  return {
    /** Block someone. Idempotent. */
    async block(blockerId: string, blockedId: string): Promise<void> {
      await db
        .insert(userBlocks)
        .values({ blockerId, blockedId, createdAt: now() })
        .onConflictDoNothing();
    },

    /** Lift a block the caller placed. Idempotent. */
    async unblock(blockerId: string, blockedId: string): Promise<void> {
      await db
        .delete(userBlocks)
        .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
    },

    /** People the caller has blocked, most recent first. */
    async listBlockedBy(blockerId: string): Promise<{ blockedId: string; createdAt: number }[]> {
      return db
        .select({ blockedId: userBlocks.blockedId, createdAt: userBlocks.createdAt })
        .from(userBlocks)
        .where(eq(userBlocks.blockerId, blockerId))
        .orderBy(desc(userBlocks.createdAt));
    },

    /**
     * Everyone the caller must not interact with: people they blocked PLUS
     * people who blocked them. This is the set discovery hides and
     * interactions refuse — the block works in both directions.
     */
    async relatedUserIds(userId: string): Promise<Set<string>> {
      const rows = await db
        .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
        .from(userBlocks)
        .where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
      const ids = new Set<string>();
      for (const r of rows) ids.add(r.blockerId === userId ? r.blockedId : r.blockerId);
      return ids;
    },

    /** Direction-aware relation between two users (for choosing the right message). */
    async relation(userId: string, otherId: string): Promise<BlockRelation> {
      const rows = await db
        .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherId)),
            and(eq(userBlocks.blockerId, otherId), eq(userBlocks.blockedId, userId)),
          ),
        );
      return {
        iBlocked: rows.some((r) => r.blockerId === userId),
        theyBlocked: rows.some((r) => r.blockerId === otherId),
      };
    },
  };
}
