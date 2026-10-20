/**
 * Shared helpers for the repository layer. Repositories are thin, typed
 * data-access modules over Drizzle — they contain NO business rules (those live
 * in the Worker's domain layer). They exist so route/service code never builds
 * raw queries and so column conventions (ids, timestamps) are applied in one
 * place.
 */
import { sql } from 'drizzle-orm';

import { type Database } from '../client';

export type { Database };

/** Epoch-ms "now". Repositories stamp `updatedAt` on every write. */
export const now = (): number => Date.now();

/** Fields to set on every update so `updatedAt` is never forgotten. */
export const touch = (): { updatedAt: number } => ({ updatedAt: now() });

/**
 * Run several write statements as ONE atomic unit. D1 has no interactive
 * transactions, but `batch()` executes its statements in a single implicit
 * transaction (all or nothing); the libsql driver used by the tests offers the
 * same. Pass un-awaited Drizzle query builders. A driver without `batch`
 * falls back to running them in order (not atomic) — production uses D1.
 */
export async function runBatch(db: Database, statements: PromiseLike<unknown>[]): Promise<void> {
  if (statements.length === 0) return;
  const batch = (db as unknown as { batch?: (s: unknown[]) => Promise<unknown> }).batch;
  if (typeof batch === 'function') {
    await batch.call(db, statements);
    return;
  }
  for (const statement of statements) await statement;
}

/** Return the single row of a `.returning()` result, or throw if absent. */
export function one<T>(rows: T[], entity: string): T {
  const row = rows[0];
  if (!row) throw new Error(`${entity}: expected a row to be returned`);
  return row;
}

/** Return the first row of a select, or `null`. */
export function firstOrNull<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

/**
 * SQL predicate: the owner's account is active. Suspended (and deleted)
 * accounts' items drop out of discovery, matching and recommendations
 * without being changed — unsuspending restores them.
 */
export const ownerIsActive = (ownerIdColumn: unknown) =>
  sql`${ownerIdColumn} IN (SELECT id FROM users WHERE status = 'active')`;
