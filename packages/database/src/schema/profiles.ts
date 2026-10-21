import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { createdAt, idColumn, updatedAt } from './_shared';
import { users } from './users';

/**
 * User-facing profile. One row per user (1:1).
 *
 * Location is stored only at a coarse level (city / region / country strings) —
 * no coordinates, no street address — so the domain model cannot hold precise
 * location data.
 */
export const profiles = sqliteTable(
  'profiles',
  {
    id: idColumn,
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    /** Optional public handle; stored lower-cased, unique when present. */
    username: text('username'),
    bio: text('bio'),
    /** R2 object key for the avatar image; the file itself is not handled here. */
    avatarKey: text('avatar_key'),
    locationCity: text('location_city'),
    locationRegion: text('location_region'),
    locationCountry: text('location_country'),
    /**
     * Private mobile number in E.164 (`+919876543210`). Never part of a public profile, listing or
     * search response: it is released only to the other party of an accepted, still-active trade
     * (see the Worker's `services/contact.ts`).
     */
    phoneE164: text('phone_e164'),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('profiles_user_id_unique').on(t.userId),
    uniqueIndex('profiles_username_unique').on(sql`lower(${t.username})`),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
