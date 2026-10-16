/**
 * PANDAM database schema (Drizzle ORM, Cloudflare D1 / SQLite).
 *
 * One file per aggregate; this barrel re-exports every table, its row types and
 * its status/enum tuples. `createDb()` (see ../client.ts) binds the whole
 * schema so the Worker gets a fully typed client.
 *
 * Conventions (see ./_shared.ts and ../id.ts):
 *  - primary keys are application-generated prefixed strings (`usr_…`, `lst_…`)
 *  - timestamps are epoch milliseconds (`integer`); `created_at` defaults in
 *    SQL, `updated_at` is refreshed by the repository layer
 *  - status columns use `text` enums + CHECK constraints for integrity
 *  - foreign keys use ON DELETE cascade/restrict/set-null as documented per table
 */
export { ITEM_TYPE, PUBLICATION_STATUS, type ItemType, type PublicationStatus } from './_shared';

export * from './meta';
export * from './users';
export * from './credentials';
export * from './oauth-identities';
export * from './sessions';
export * from './profiles';
export * from './categories';
export * from './listings';
export * from './listing-images';
export * from './needs';
export * from './need-images';
export * from './matches';
export * from './offers';
export * from './conversations';
export * from './messages';
export * from './barter-transactions';
export * from './reviews';
export * from './notifications';
export * from './push-tokens';
export * from './reports';
export * from './disputes';
export * from './payments';
export * from './demo-fee-transactions';
export * from './item-views';
