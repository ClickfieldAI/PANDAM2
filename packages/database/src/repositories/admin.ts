import { and, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { newId } from '../id';
import { type AdminAuditRow, adminAuditLog } from '../schema/admin-audit-log';
import { barterTransactions } from '../schema/barter-transactions';
import { listings } from '../schema/listings';
import { needs } from '../schema/needs';
import { type ReportRow, type ReportStatus, reports } from '../schema/reports';
import { sessions } from '../schema/sessions';
import { type UserRole, type UserRow, type UserStatus, users } from '../schema/users';

import { type Database, firstOrNull, now, touch } from './helpers';

export type ModeratedKind = 'listing' | 'need';

export interface AuditInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** SQL: "another active admin exists besides `id`" — the last-admin guard, evaluated inside the UPDATE. */
const anotherAdmin = (id: string) =>
  sql`EXISTS (SELECT 1 FROM users u2 WHERE u2.role = 'admin' AND u2.status = 'active' AND u2.id <> ${id})`;

export function adminRepository(db: Database) {
  const itemTable = (kind: ModeratedKind) => (kind === 'listing' ? listings : needs);

  return {
    // ---- audit log (append-only: there is no update or delete) -------------
    async audit(input: AuditInput): Promise<void> {
      await db.insert(adminAuditLog).values({
        id: newId('adminAudit'),
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      });
    },

    async listAudit(opts: {
      limit: number;
      offset: number;
      targetType?: string;
      targetId?: string;
      actorId?: string;
    }): Promise<AdminAuditRow[]> {
      const where = [
        opts.targetType ? eq(adminAuditLog.targetType, opts.targetType) : undefined,
        opts.targetId ? eq(adminAuditLog.targetId, opts.targetId) : undefined,
        opts.actorId ? eq(adminAuditLog.actorId, opts.actorId) : undefined,
      ].filter((w) => w !== undefined);
      return db
        .select()
        .from(adminAuditLog)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
        .limit(opts.limit)
        .offset(opts.offset);
    },

    // ---- users ---------------------------------------------------------------
    async searchUsers(opts: {
      q?: string;
      status?: UserStatus;
      role?: UserRole;
      limit: number;
      offset: number;
    }): Promise<UserRow[]> {
      const where = [
        opts.status ? eq(users.status, opts.status) : undefined,
        opts.role ? eq(users.role, opts.role) : undefined,
        opts.q
          ? or(
              eq(users.id, opts.q),
              like(sql`lower(${users.email})`, `%${opts.q.toLowerCase().replace(/[%_\\]/g, '')}%`),
            )
          : undefined,
      ].filter((w) => w !== undefined);
      return db
        .select()
        .from(users)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(opts.limit)
        .offset(opts.offset);
    },

    /** active -> suspended, once. Refuses to suspend the last active admin. */
    async suspendUser(id: string, reason: string): Promise<UserRow | null> {
      const rows = await db
        .update(users)
        .set({ status: 'suspended', suspendedAt: now(), suspensionReason: reason, ...touch() })
        .where(
          and(
            eq(users.id, id),
            eq(users.status, 'active'),
            sql`(${users.role} <> 'admin' OR ${anotherAdmin(id)})`,
          ),
        )
        .returning();
      if (rows[0]) {
        await db
          .update(sessions)
          .set({ revokedAt: now() })
          .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      }
      return firstOrNull(rows);
    },

    /** suspended -> active, once. */
    async unsuspendUser(id: string): Promise<UserRow | null> {
      const rows = await db
        .update(users)
        .set({ status: 'active', suspendedAt: null, suspensionReason: null, ...touch() })
        .where(and(eq(users.id, id), eq(users.status, 'suspended')))
        .returning();
      return firstOrNull(rows);
    },

    /** Change a role. Demoting the last active admin is refused inside the statement. */
    async setRole(id: string, role: UserRole): Promise<UserRow | null> {
      const rows = await db
        .update(users)
        .set({ role, ...touch() })
        .where(
          and(
            eq(users.id, id),
            sql`${users.role} <> ${role}`,
            sql`(${users.role} <> 'admin' OR ${anotherAdmin(id)})`,
          ),
        )
        .returning();
      return firstOrNull(rows);
    },

    // ---- listings / needs ------------------------------------------------------
    async findItem(kind: ModeratedKind, id: string) {
      const t = itemTable(kind);
      const rows = await db.select().from(t).where(eq(t.id, id)).limit(1);
      return firstOrNull(rows);
    },

    /** Remove from circulation: archived + marked. Once only. */
    async takeDown(kind: ModeratedKind, id: string, reason: string, byUserId: string) {
      const t = itemTable(kind);
      const rows = await db
        .update(t)
        .set({
          status: 'archived',
          moderationRemovedAt: now(),
          moderationReason: reason,
          moderationBy: byUserId,
          ...touch(),
        })
        .where(and(eq(t.id, id), isNull(t.moderationRemovedAt)))
        .returning();
      return firstOrNull(rows);
    },

    /** Clear the marker. The item stays archived; the owner re-publishes. */
    async reinstate(kind: ModeratedKind, id: string) {
      const t = itemTable(kind);
      const rows = await db
        .update(t)
        .set({
          moderationRemovedAt: null,
          moderationReason: null,
          moderationBy: null,
          ...touch(),
        })
        .where(and(eq(t.id, id), sql`${t.moderationRemovedAt} IS NOT NULL`))
        .returning();
      return firstOrNull(rows);
    },

    // ---- reports ---------------------------------------------------------------
    async listReports(opts: {
      status?: ReportStatus;
      subjectType?: ReportRow['subjectType'];
      limit: number;
      offset: number;
    }): Promise<ReportRow[]> {
      const where = [
        opts.status ? eq(reports.status, opts.status) : undefined,
        opts.subjectType ? eq(reports.subjectType, opts.subjectType) : undefined,
      ].filter((w) => w !== undefined);
      return (
        db
          .select()
          .from(reports)
          .where(where.length ? and(...where) : undefined)
          // Oldest unresolved first is what a reviewer wants; resolved ones newest first.
          .orderBy(desc(reports.createdAt), desc(reports.id))
          .limit(opts.limit)
          .offset(opts.offset)
      );
    },

    async findReport(id: string): Promise<ReportRow | null> {
      const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
      return firstOrNull(rows);
    },

    /** Compare-and-swap a report's status; null when it was no longer in `from`. */
    async transitionReport(
      id: string,
      from: ReportStatus[],
      to: ReportStatus,
      reviewerId: string,
      note: string | null,
    ): Promise<ReportRow | null> {
      const rows = await db
        .update(reports)
        .set({
          status: to,
          reviewedBy: reviewerId,
          reviewedAt: now(),
          resolutionNote: note,
          ...touch(),
        })
        .where(and(eq(reports.id, id), inArray(reports.status, from)))
        .returning();
      return firstOrNull(rows);
    },

    // ---- transactions (read-only) ---------------------------------------------
    async listTransactions(opts: {
      status?: (typeof barterTransactions.$inferSelect)['status'];
      userId?: string;
      limit: number;
      offset: number;
    }) {
      const where = [
        opts.status ? eq(barterTransactions.status, opts.status) : undefined,
        opts.userId
          ? or(
              eq(barterTransactions.initiatedByUserId, opts.userId),
              eq(barterTransactions.counterpartyUserId, opts.userId),
            )
          : undefined,
      ].filter((w) => w !== undefined);
      return db
        .select()
        .from(barterTransactions)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(barterTransactions.createdAt), desc(barterTransactions.id))
        .limit(opts.limit)
        .offset(opts.offset);
    },
  };
}

export type AdminRepository = ReturnType<typeof adminRepository>;
