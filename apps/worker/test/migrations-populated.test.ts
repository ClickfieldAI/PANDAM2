/**
 * Migrations 0013-0019 against POPULATED data. Builds a database at the 0012 schema,
 * inserts real-looking rows — including duplicate pending offers that the new
 * unique indexes would reject — then applies 0013 and checks that it succeeds,
 * keeps all existing data, repairs the duplicates non-destructively, and
 * enforces the new rules afterwards.
 */
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(HERE, '../../../packages/database/migrations');

let client: Client;
let workdir = '';

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  // A copy of the migrations folder WITHOUT 0013+ in its journal = the 0012 schema.
  workdir = mkdtempSync(join(tmpdir(), 'pandam-mig-'));
  cpSync(MIGRATIONS, workdir, { recursive: true });
  const journalPath = join(workdir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  journal.entries = journal.entries.filter((e) => e.tag.slice(0, 4) < '0013');
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrate(drizzle(client), { migrationsFolder: workdir });
  await client.execute('PRAGMA foreign_keys = ON');
});

afterEach(() => {
  client.close();
  rmSync(workdir, { recursive: true, force: true });
});

const run = (sql: string, args: (string | number | null)[] = []) => client.execute({ sql, args });

async function applyMigration(prefix: string) {
  const file = readdirSync(MIGRATIONS).find((f) => f.startsWith(prefix))!;
  const statements = readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await client.execute(statement);
}

describe('migration 0013 (barter engine) on a populated database', () => {
  it('applies cleanly, keeps data, repairs duplicate pending offers and enforces the new rules', async () => {
    await run(`INSERT INTO users (id, email) VALUES ('u1','a@example.com'),('u2','b@example.com')`);
    await run(`INSERT INTO categories (id, name, slug) VALUES ('c1','Design','design')`);
    for (const [id, owner] of [
      ['l1', 'u1'],
      ['l2', 'u1'],
      ['l3', 'u2'],
    ] as const) {
      await run(
        `INSERT INTO listings (id, owner_id, category_id, type, title, description, status)
         VALUES (?, ?, 'c1', 'service', 'Title', 'Description here', 'published')`,
        [id, owner],
      );
    }
    // Two PENDING offers from u1 for the same requested listing (l3) — what a race could have left behind —
    // plus an old accepted offer with a legacy 'created' transaction.
    await run(
      `INSERT INTO offers (id, from_user_id, to_user_id, offered_listing_id, requested_listing_id, status, created_at)
       VALUES ('o_first','u1','u2','l1','l3','pending',1000),
              ('o_second','u1','u2','l2','l3','pending',2000)`,
    );
    await run(
      `INSERT INTO offers (id, from_user_id, to_user_id, offered_listing_id, requested_listing_id, status)
       VALUES ('o_old','u2','u1','l3','l2','accepted')`,
    );
    await run(
      `INSERT INTO barter_transactions (id, offer_id, initiated_by_user_id, counterparty_user_id, status)
       VALUES ('t_old','o_old','u2','u1','created')`,
    );

    // The same live report filed twice by one person (nothing stopped this before 0016).
    await run(
      `INSERT INTO reports (id, reporter_id, subject_type, subject_id, reason, status, created_at, updated_at)
       VALUES ('r_first','u1','user','u2','spam','open',1000,1000),
              ('r_second','u1','user','u2','scam','open',2000,2000),
              ('r_other','u2','user','u1','spam','open',1500,1500)`,
    );

    // Chat history that exists before 0017 added message retry ids.
    await run(`INSERT INTO conversations (id) VALUES ('cv_old')`);
    await run(
      `INSERT INTO messages (id, conversation_id, sender_id, body) VALUES ('m_old1','cv_old','u1','hello'),('m_old2','cv_old','u1','hello again')`,
    );

    // Without the repair step this would violate the new unique index.
    await applyMigration('0013');
    await applyMigration('0014');
    await applyMigration('0015');
    await applyMigration('0016');
    await applyMigration('0017');
    await applyMigration('0018');
    await applyMigration('0019');
    await applyMigration('0020');

    const offers = (await run('SELECT id, status FROM offers ORDER BY id')).rows;
    const byId = Object.fromEntries(offers.map((r) => [String(r.id), String(r.status)]));
    expect(byId).toEqual({ o_first: 'pending', o_old: 'accepted', o_second: 'cancelled' });

    // Existing transaction survives, with the new columns empty (nobody has confirmed yet).
    const tx = (
      await run(
        'SELECT status, initiator_confirmed_at, counterparty_confirmed_at FROM barter_transactions',
      )
    ).rows[0]!;
    expect(tx.status).toBe('created');
    expect(tx.initiator_confirmed_at).toBeNull();
    expect(tx.counterparty_confirmed_at).toBeNull();
    expect((await run('SELECT COUNT(*) AS n FROM listings')).rows[0]!.n).toBe(3);

    // New rules are live: a second pending offer for the same item is refused…
    await expect(
      run(
        `INSERT INTO offers (id, from_user_id, to_user_id, offered_listing_id, requested_listing_id, status)
         VALUES ('o_third','u1','u2','l2','l3','pending')`,
      ),
    ).rejects.toThrow();
    // …idempotency keys are unique per sender…
    await run(`UPDATE offers SET idempotency_key = 'key-0001-aaaa' WHERE id = 'o_first'`);
    await expect(
      run(`UPDATE offers SET idempotency_key = 'key-0001-aaaa' WHERE id = 'o_second'`),
    ).rejects.toThrow();
    // …and the event table accepts one event per (transaction, type, actor).
    await run(
      `INSERT INTO barter_transaction_events (id, transaction_id, actor_user_id, type) VALUES ('e1','t_old','u1','confirmed')`,
    );
    await expect(
      run(
        `INSERT INTO barter_transaction_events (id, transaction_id, actor_user_id, type) VALUES ('e2','t_old','u1','confirmed')`,
      ),
    ).rejects.toThrow();

    // 0014: existing offers have no parent; only one counter may point at a parent…
    expect(
      (await run('SELECT COUNT(*) AS n FROM offers WHERE parent_offer_id IS NOT NULL')).rows[0]!.n,
    ).toBe(0);
    await run(
      `INSERT INTO offers (id, from_user_id, to_user_id, offered_listing_id, requested_listing_id, status, parent_offer_id)
       VALUES ('o_counter','u2','u1','l3','l1','pending','o_first')`,
    );
    await expect(
      run(
        `INSERT INTO offers (id, from_user_id, to_user_id, offered_listing_id, requested_listing_id, status, parent_offer_id)
         VALUES ('o_counter2','u2','u1','l3','l2','pending','o_first')`,
      ),
    ).rejects.toThrow();
    // …and a new status is storable.
    await run(`UPDATE offers SET status = 'countered' WHERE id = 'o_first'`);
    // Deleting a parent offer must not be blocked by (or cascade to) its counter: ON DELETE SET NULL.
    await run(`DELETE FROM offers WHERE id = 'o_first'`);
    const orphan = (await run(`SELECT parent_offer_id FROM offers WHERE id = 'o_counter'`))
      .rows[0]!;
    expect(orphan.parent_offer_id).toBeNull();

    // 0017: existing messages keep a NULL retry id (any number may); a real id is unique per sender.
    expect(
      (await run('SELECT COUNT(*) AS n FROM messages WHERE client_id IS NULL')).rows[0]!.n,
    ).toBe(2);
    await run(
      `INSERT INTO messages (id, conversation_id, sender_id, body, client_id) VALUES ('m_new1','cv_old','u1','x','client-retry-0001')`,
    );
    await expect(
      run(
        `INSERT INTO messages (id, conversation_id, sender_id, body, client_id) VALUES ('m_new2','cv_old','u1','x','client-retry-0001')`,
      ),
    ).rejects.toThrow();
    await run(
      `INSERT INTO messages (id, conversation_id, sender_id, body, client_id) VALUES ('m_new3','cv_old','u2','x','client-retry-0001')`,
    );

    // 0016: duplicate live reports are collapsed (earliest kept), others untouched; blocks exist.
    const reps = Object.fromEntries(
      (await run('SELECT id, status FROM reports ORDER BY id')).rows.map((r) => [
        String(r.id),
        String(r.status),
      ]),
    );
    expect(reps).toEqual({ r_first: 'open', r_other: 'open', r_second: 'dismissed' });
    await expect(
      run(
        `INSERT INTO reports (id, reporter_id, subject_type, subject_id, reason) VALUES ('r_third','u1','user','u2','spam')`,
      ),
    ).rejects.toThrow();
    await run(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('u1','u2')`);
    await expect(
      run(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ('u1','u1')`),
    ).rejects.toThrow();

    // 0019: every existing user becomes a plain, active user; nothing is taken down or reviewed.
    expect((await run("SELECT COUNT(*) AS n FROM users WHERE role <> 'user'")).rows[0]!.n).toBe(0);
    expect(
      (await run('SELECT COUNT(*) AS n FROM listings WHERE moderation_removed_at IS NOT NULL'))
        .rows[0]!.n,
    ).toBe(0);
    expect(
      (await run('SELECT COUNT(*) AS n FROM reports WHERE reviewed_by IS NOT NULL')).rows[0]!.n,
    ).toBe(0);
    expect((await run('SELECT COUNT(*) AS n FROM admin_audit_log')).rows[0]!.n).toBe(0);

    // 0020: existing notifications keep their rows (no dedupe key, so any number may share NULL); real keys are unique per user.
    await run(
      "INSERT INTO notifications (id, user_id, type) VALUES ('n_a','u1','need_match'), ('n_b','u1','need_match')",
    );
    await run(
      "INSERT INTO notifications (id, user_id, type, dedupe_key) VALUES ('n_c','u1','offer_received','k')",
    );
    await expect(
      run(
        "INSERT INTO notifications (id, user_id, type, dedupe_key) VALUES ('n_d','u1','offer_received','k')",
      ),
    ).rejects.toThrow();
    await run(
      "INSERT INTO notifications (id, user_id, type, dedupe_key) VALUES ('n_e','u2','offer_received','k')",
    );

    // 0015: existing listings/needs are not "deleted"; favourites are unique per
    // (user, listing) and disappear together with the listing they point at.
    expect(
      (await run('SELECT COUNT(*) AS n FROM listings WHERE deleted_at IS NOT NULL')).rows[0]!.n,
    ).toBe(0);
    await run(`INSERT INTO favourites (user_id, listing_id) VALUES ('u1','l3')`);
    await expect(
      run(`INSERT INTO favourites (user_id, listing_id) VALUES ('u1','l3')`),
    ).rejects.toThrow();
    // A listing no offer touches can be deleted; its saves go with it.
    await run(
      `INSERT INTO listings (id, owner_id, category_id, type, title, description, status)
       VALUES ('l_lone','u2','c1','service','Lone','Description here','published')`,
    );
    await run(`INSERT INTO favourites (user_id, listing_id) VALUES ('u1','l_lone')`);
    await run(`DELETE FROM listings WHERE id = 'l_lone'`);
    expect(
      (await run(`SELECT COUNT(*) AS n FROM favourites WHERE listing_id = 'l_lone'`)).rows[0]!.n,
    ).toBe(0);
    // The save on a listing that DOES have history is untouched.
    expect((await run('SELECT COUNT(*) AS n FROM favourites')).rows[0]!.n).toBe(1);
  });

  it('applies cleanly to an empty database too', async () => {
    await applyMigration('0013');
    await applyMigration('0014');
    await applyMigration('0015');
    await applyMigration('0016');
    await applyMigration('0017');
    expect((await run('SELECT COUNT(*) AS n FROM barter_transaction_events')).rows[0]!.n).toBe(0);
  });
});
