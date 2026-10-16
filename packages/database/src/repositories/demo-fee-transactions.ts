import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { newId } from '../id';
import {
  type DemoFeeTransactionRow,
  type NewDemoFeeTransactionRow,
  demoFeeTransactions,
} from '../schema/demo-fee-transactions';
import { type ListingRow, listings } from '../schema/listings';

import { type Database, firstOrNull } from './helpers';

export type CreateDemoFeeTransactionInput = Omit<
  NewDemoFeeTransactionRow,
  'id' | 'isDemo' | 'status' | 'createdAt'
>;

export interface DemoRevenueTotals {
  count: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
}

export interface DemoTierTotals {
  tierLabel: string;
  count: number;
  feeAmount: number;
}

export function demoFeeTransactionsRepository(db: Database) {
  return {
    /**
     * Insert once per (user, idempotency key). A repeat returns the ORIGINAL
     * row with `created: false`, so a retried confirm never double-counts fee
     * revenue. The unique index makes this safe under concurrent requests.
     */
    async createOnce(
      input: CreateDemoFeeTransactionInput,
    ): Promise<{ row: DemoFeeTransactionRow; created: boolean }> {
      const inserted = await db
        .insert(demoFeeTransactions)
        .values({ ...input, id: newId('demoFeeTransaction') })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { row: inserted[0], created: true };
      const existing = await db
        .select()
        .from(demoFeeTransactions)
        .where(
          and(
            eq(demoFeeTransactions.userId, input.userId),
            eq(demoFeeTransactions.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      const row = firstOrNull(existing);
      if (!row) throw new Error('demoFeeTransactions.createOnce: conflict without a row');
      return { row, created: false };
    },

    async recent(limit: number): Promise<DemoFeeTransactionRow[]> {
      return db
        .select()
        .from(demoFeeTransactions)
        .orderBy(desc(demoFeeTransactions.createdAt))
        .limit(limit);
    },

    /** Platform-wide totals across every simulated transaction. */
    async totals(): Promise<DemoRevenueTotals> {
      const rows = await db
        .select({
          count: sql<number>`count(*)`,
          gross: sql<number>`coalesce(sum(${demoFeeTransactions.amount}), 0)`,
          fee: sql<number>`coalesce(sum(${demoFeeTransactions.feeAmount}), 0)`,
          net: sql<number>`coalesce(sum(${demoFeeTransactions.netAmount}), 0)`,
        })
        .from(demoFeeTransactions);
      const r = rows[0];
      return {
        count: Number(r?.count ?? 0),
        grossAmount: Number(r?.gross ?? 0),
        feeAmount: Number(r?.fee ?? 0),
        netAmount: Number(r?.net ?? 0),
      };
    },

    async byTier(): Promise<DemoTierTotals[]> {
      const rows = await db
        .select({
          tierLabel: demoFeeTransactions.tierLabel,
          count: sql<number>`count(*)`,
          fee: sql<number>`coalesce(sum(${demoFeeTransactions.feeAmount}), 0)`,
        })
        .from(demoFeeTransactions)
        .groupBy(demoFeeTransactions.tierLabel);
      return rows.map((r) => ({
        tierLabel: r.tierLabel,
        count: Number(r.count),
        feeAmount: Number(r.fee),
      }));
    },

    /** Published `sale`/`both` listings — what a demo transaction can pick. */
    async saleListings(limit: number): Promise<ListingRow[]> {
      return db
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.status, 'published'),
            inArray(listings.transactionType, ['sale', 'both']),
          ),
        )
        .orderBy(desc(listings.createdAt))
        .limit(limit);
    },
  };
}
