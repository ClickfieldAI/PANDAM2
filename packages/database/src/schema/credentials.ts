import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn, updatedAt } from './_shared';
import { users } from './users';

/**
 * A user's password credential. Split from `users` so the identity record can
 * be read/written without ever touching the hash, and so alternative
 * credential types (OAuth, passkeys) can be added later as sibling tables
 * without reshaping `users`.
 *
 * `passwordHash` is a self-describing string — current format:
 *   `pbkdf2x2$sha256$<iterationsPerRound>$<salt1_b64url>$<salt2_b64url>$<hash_b64url>`
 * (an older single-round `pbkdf2$sha256$<iterations>$<salt>$<hash>` format is
 * still verified, never written — see apps/worker/src/lib/crypto.ts) so the
 * KDF parameters can be raised over time and credentials re-hashed on the
 * user's next successful login. It is NEVER returned by the API.
 *
 * One row per user (1:1). `ON DELETE cascade` — deleting the user removes it.
 */
export const credentials = sqliteTable(
  'credentials',
  {
    id: idColumn,
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash').notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('credentials_user_id_unique').on(t.userId)],
);

export type CredentialRow = typeof credentials.$inferSelect;
export type NewCredentialRow = typeof credentials.$inferInsert;
