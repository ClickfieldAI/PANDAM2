import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  IDENTITY_VERIFICATION_STATUS,
  type IdentityVerificationStatus,
  USER_ROLE,
  USER_STATUS,
  type UserRole,
  type UserStatus,
} from '../enums';

import { createdAt, idColumn, nullableTimestamp, updatedAt } from './_shared';

export {
  IDENTITY_VERIFICATION_STATUS,
  type IdentityVerificationStatus,
  USER_ROLE,
  USER_STATUS,
  type UserRole,
  type UserStatus,
};

/**
 * An authenticated PANDAM user.
 *
 * `email` is the stable authentication identifier for now. This phase does NOT
 * implement an auth provider or store credentials — a later, separate phase
 * wires real authentication and injects the resolved user id into request
 * context. Nothing here assumes a particular provider.
 */
export const users = sqliteTable(
  'users',
  {
    id: idColumn,
    email: text('email').notNull(),
    status: text('status', { enum: USER_STATUS }).notNull().default('active'),
    /** Staff role. Only ever changed by an admin (or the documented DB bootstrap). */
    role: text('role', { enum: USER_ROLE }).notNull().default('user'),
    suspendedAt: nullableTimestamp('suspended_at'),
    suspensionReason: text('suspension_reason'),
    /**
     * One-time identity verification (see apps/worker/src/services/verification.ts).
     * Only OUTCOMES are stored — never an ID number, document, OTP or image.
     */
    identityVerificationStatus: text('identity_verification_status', {
      enum: IDENTITY_VERIFICATION_STATUS,
    })
      .notNull()
      .default('not_started'),
    governmentIdVerifiedAt: nullableTimestamp('government_id_verified_at'),
    faceVerifiedAt: nullableTimestamp('face_verified_at'),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Case-insensitive uniqueness for the auth identifier.
    uniqueIndex('users_email_unique').on(sql`lower(${t.email})`),
    index('users_status_idx').on(t.status),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
