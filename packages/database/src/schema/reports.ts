import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_SUBJECT_TYPE,
  type ReportReason,
  type ReportStatus,
  type ReportSubjectType,
} from '../enums';

import { createdAt, idColumn, updatedAt } from './_shared';
import { users } from './users';

export {
  REPORT_REASON,
  REPORT_STATUS,
  REPORT_SUBJECT_TYPE,
  type ReportReason,
  type ReportStatus,
  type ReportSubjectType,
};

/**
 * A user-submitted report about another entity. The subject is polymorphic
 * (`subjectType` + `subjectId`) so there is no FK; the repository validates the
 * referenced row exists. No admin tooling is built in this phase.
 */
export const reports = sqliteTable(
  'reports',
  {
    id: idColumn,
    reporterId: text('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type', { enum: REPORT_SUBJECT_TYPE }).notNull(),
    subjectId: text('subject_id').notNull(),
    reason: text('reason', { enum: REPORT_REASON }).notNull(),
    details: text('details'),
    /**
     * What the reported thing looked like when it was reported (JSON: title /
     * message excerpt / names). Content can be edited or deleted afterwards;
     * this keeps the evidence a reviewer needs.
     */
    subjectSnapshot: text('subject_snapshot'),
    status: text('status', { enum: REPORT_STATUS }).notNull().default('open'),
    /** Staff review: who, when, and the note recorded with the decision. */
    reviewedBy: text('reviewed_by'),
    reviewedAt: integer('reviewed_at'),
    resolutionNote: text('resolution_note'),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('reports_subject_idx').on(t.subjectType, t.subjectId),
    index('reports_status_idx').on(t.status),
    index('reports_reporter_idx').on(t.reporterId),
    // One live report per (reporter, subject): re-reporting the same thing
    // returns the existing one instead of piling up duplicates.
    uniqueIndex('reports_live_unique')
      .on(t.reporterId, t.subjectType, t.subjectId)
      .where(sql`${t.status} IN ('open', 'reviewing')`),
  ],
);

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;
