import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn } from './_shared';

/**
 * Append-only record of staff actions. No update or delete path exists in the
 * repository. `actorId` / `targetId` are plain text (no FK) so the trail
 * survives deletion of either account.
 */
export const adminAuditLog = sqliteTable(
  'admin_audit_log',
  {
    id: idColumn,
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    /** JSON, small, no secrets. */
    metadata: text('metadata'),
    createdAt,
  },
  (t) => [
    index('admin_audit_actor_idx').on(t.actorId, t.createdAt),
    index('admin_audit_target_idx').on(t.targetType, t.targetId),
    index('admin_audit_created_idx').on(t.createdAt),
  ],
);

export type AdminAuditRow = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditRow = typeof adminAuditLog.$inferInsert;
