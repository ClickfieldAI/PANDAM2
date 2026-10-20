# Backup and restore runbook

What holds state, and how to get it back.

| State                         | Where           | Backed up by                                                                      |
| ----------------------------- | --------------- | --------------------------------------------------------------------------------- |
| Everything relational         | Cloudflare D1   | D1 **Time Travel** (automatic, point-in-time) plus your own scheduled `d1 export` |
| Listing photos, chat images   | Cloudflare R2   | **Nothing automatic.** You must copy the bucket yourself (see below)              |
| Secrets (Razorpay, Sentry, …) | Worker secrets  | Your password manager. They cannot be read back from Cloudflare                   |
| Migrations / code             | This repository | Git                                                                               |

Database rows reference photos by object key. A database restored without the matching bucket contents shows broken images; a bucket restored without the database is orphaned files. Back up and restore them as a pair.

## 1. Routine backup (D1)

Time Travel keeps a rolling history of the database (Cloudflare documents the retention window for your plan — check it, it is not controlled from this repo). It protects against mistakes such as a bad migration or a bad `UPDATE`. It does **not** protect against losing the Cloudflare account, so also keep your own exports.

Export schema + data (a point-in-time copy of the whole database):

```bash
cd apps/worker
pnpm exec wrangler d1 export pandam-db --remote --output ../../backups/pandam-$(date +%F).sql
```

Treat the file as production data: it contains emails, password hashes, hashed session tokens and private messages. Encrypt it, keep it out of git (`backups/` is not in the repo), and delete old copies on a schedule.

## 2. Undo a mistake: Time Travel

```bash
cd apps/worker
# What bookmark / state exists around a moment? (ISO-8601 timestamp or unix seconds)
pnpm exec wrangler d1 time-travel info pandam-db --timestamp "2026-10-18T09:30:00Z"
# Roll the whole database back to that moment (this REPLACES current data).
pnpm exec wrangler d1 time-travel restore pandam-db --timestamp "2026-10-18T09:30:00Z"
```

- A restore discards everything written after that moment. Note the bookmark `restore` prints before you run it: it is the "undo the undo" point.
- Put the app in a quiet state first if you can (writes during a restore are lost).
- Sessions are in the database, so rolled-back sessions come back too: anyone suspended after the restore point is active again until you re-apply it. Re-check suspensions (`admin_audit_log` rows made after the restore point are gone as well — keep your own notes).

## 3. Restore from an export file

**Do not replay a full export into an empty database.** D1 exports tables in the order they were created over the migration history, so a child table (for example `listing_images`) can be written before its parent (`listings`). Replaying that file fails with `no such table: main.listings`. This was reproduced locally while writing this runbook.

The procedure that works — schema from migrations, data from the export:

```bash
cd apps/worker
# 1. Export the data of every application table (not the migrations ledger).
#    List the tables first:
pnpm exec wrangler d1 execute pandam-db --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name"
# One --table flag per name from the list above (users, profiles, listings, …):
pnpm exec wrangler d1 export pandam-db --remote --no-schema \
  --table users --table profiles --table listings \
  --output ../../backups/pandam-data.sql

# 2. Create a NEW, EMPTY database and give it the schema from the repo.
pnpm exec wrangler d1 create pandam-db-restored      # then point wrangler.jsonc at it
pnpm exec wrangler d1 migrations apply pandam-db-restored --remote

# 3. Load the data. Foreign keys are deferred inside the file, so order does not matter now.
pnpm exec wrangler d1 execute pandam-db-restored --remote --file ../../backups/pandam-data.sql
```

Then compare row counts for the important tables (`users`, `listings`, `offers`, `messages`, `barter_transactions`) against the source before switching the Worker over.

**Verified locally** (not against Cloudflare): a data-only export of the local development database loaded into a freshly migrated database reproduced identical row counts for users, listings, messages, sessions and the audit log. `d1 time-travel` is Cloudflare-side and was **not** exercised.

## 4. R2 (photos)

R2 has no automatic backup. Choose one:

- Enable object versioning / replication in the Cloudflare dashboard if your plan offers it, or
- Copy the bucket on a schedule with any S3-compatible tool (R2 exposes an S3 API), for example `rclone sync r2:pandam-media /secure/backup/pandam-media`.

Restore is the reverse copy. Keys are stable, so no database change is needed.

## 5. Restore drill (do this before you need it)

1. Take an export as in §3 from production (or from a staging copy).
2. Restore into a throwaway database.
3. Point a local `wrangler dev` at it and sign in as a test user; open a listing with photos and a conversation.
4. Record how long it took. That number is your real recovery time.

Nobody has run steps 1–4 against a real Cloudflare account for this project yet.

## 6. After a restore

- Rotate nothing by default, but if the cause was a leak, revoke all sessions (`UPDATE sessions SET revoked_at = unixepoch('subsec')*1000 WHERE revoked_at IS NULL`) and consider rotating secrets.
- Rate-limit counters (`rate_limits`) are disposable; they may be left or emptied.
- Re-check the admin accounts (`SELECT id,email,role FROM users WHERE role <> 'user'`).
