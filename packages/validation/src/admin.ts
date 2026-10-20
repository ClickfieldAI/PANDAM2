import { USER_ROLE, USER_STATUS } from '@pandam/database/enums';

import { boundedString, reportSubjectTypeSchema, z } from './common';

/** Every staff mutation carries a reason, which is recorded in the audit log. */
export const adminReasonSchema = z.object({ reason: boundedString(5, 500) });
export type AdminReasonInput = z.infer<typeof adminReasonSchema>;

export const adminSetRoleSchema = z.object({
  role: z.enum(USER_ROLE),
  reason: boundedString(5, 500),
});

export const adminReportReviewSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed', 'open']),
  /** Required to close a report (resolved / dismissed). */
  note: boundedString(5, 1000).optional(),
});

const page = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
};

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUS).optional(),
  role: z.enum(USER_ROLE).optional(),
  ...page,
});

export const adminReportsQuerySchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
  subjectType: reportSubjectTypeSchema.optional(),
  ...page,
});

export const adminTransactionsQuerySchema = z.object({
  status: z.enum(['created', 'in_progress', 'completed', 'cancelled', 'disputed']).optional(),
  userId: z.string().max(64).optional(),
  ...page,
});

export const adminAuditQuerySchema = z.object({
  targetType: z.string().max(40).optional(),
  targetId: z.string().max(64).optional(),
  actorId: z.string().max(64).optional(),
  ...page,
});
