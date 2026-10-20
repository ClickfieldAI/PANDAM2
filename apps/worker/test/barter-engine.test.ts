/**
 * Milestone 1 — offer & transaction engine correctness.
 *
 * These run through the real HTTP routes against a real SQLite engine with the
 * project's real migrations. NOTE ON CONCURRENCY: the in-memory test database
 * serialises statements on one connection, so these tests prove the logic is
 * convergent and duplicate-free under overlapping requests, and (separately,
 * at the SQL level) that the compare-and-swap / unique-index guards exist. They
 * cannot prove D1's behaviour across Worker isolates — that is documented as
 * unverified in the milestone report.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;
let catId = '';

beforeEach(async () => {
  ctx = await makeTestDb();
  catId = newId('category');
  await ctx.db.insert(schema.categories).values([{ id: catId, name: 'Design', slug: 'design' }]);
});
afterEach(() => ctx.close());

type App = ReturnType<TestDb['makeApp']>;
type Ok<T> = { ok: true; data: T };
const json = <T>(r: Response) => r.json() as Promise<T>;
const H = (t: string, extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${t}`,
  ...extra,
});

async function user(app: App, name: string): Promise<AuthSession> {
  const r = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name.toLowerCase()}${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a valid pw 12',
        displayName: name,
      }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(r)).data;
}

async function listing(app: App, token: string, title: string): Promise<MarketItem> {
  const r = await app.request(
    '/api/v1/listings',
    {
      method: 'POST',
      headers: H(token),
      body: JSON.stringify({
        categoryId: catId,
        type: 'service',
        title,
        description: 'A perfectly good thing to trade.',
        status: 'published',
      }),
    },
    testEnv,
  );
  return (await json<Ok<{ item: MarketItem }>>(r)).data.item;
}

function sendOffer(
  app: App,
  token: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.request(
    '/api/v1/offers',
    { method: 'POST', headers: H(token, headers), body: JSON.stringify(body) },
    testEnv,
  );
}

const offerId = async (r: Response) => (await json<Ok<{ offer: { id: string } }>>(r)).data.offer.id;
const respond = (app: App, token: string, id: string, action: string) =>
  app.request(
    `/api/v1/offers/${id}/respond`,
    { method: 'POST', headers: H(token), body: JSON.stringify({ action }) },
    testEnv,
  );
const txAction = (app: App, token: string, id: string, action: string) =>
  app.request(
    `/api/v1/transactions/${id}/status`,
    { method: 'POST', headers: H(token), body: JSON.stringify({ action }) },
    testEnv,
  );

/** Alice and Bob, one listing each, and a pending offer Alice -> Bob. */
async function setup() {
  const app = ctx.makeApp();
  const alice = await user(app, 'Alice');
  const bob = await user(app, 'Bob');
  const aliceItem = await listing(app, alice.token, 'Logo design');
  const bobItem = await listing(app, bob.token, 'Copywriting');
  const res = await sendOffer(app, alice.token, {
    offeredListingId: aliceItem.id,
    requestedListingId: bobItem.id,
  });
  expect(res.status).toBe(201);
  return { app, alice, bob, aliceItem, bobItem, id: await offerId(res) };
}

const listingStatus = async (id: string) =>
  (await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, id)))[0]?.status;
/** Notification `data` is stored as a JSON string of related ids. */
const dataOf = (n: { data: string | null }): Record<string, string> =>
  n.data ? (JSON.parse(n.data) as Record<string, string>) : {};
const notificationsOf = async (userId: string, type: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === type,
  );

describe('accepting an offer', () => {
  it('refuses an expired offer, marks it expired and tells the sender', async () => {
    const { app, alice, bob, id } = await setup();
    await ctx.db
      .update(schema.offers)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(schema.offers.id, id));

    const res = await respond(app, bob.token, id, 'accept');
    expect(res.status).toBe(422);
    expect((await json<{ error: { message: string } }>(res)).error.message).toMatch(/expired/i);

    const row = (await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, id)))[0];
    expect(row?.status).toBe('expired');
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(0);
    expect(await notificationsOf(alice.user.id, 'offer_expired')).toHaveLength(1);
  });

  it('refuses when the offered item is no longer published, leaving everything unchanged', async () => {
    const { app, bob, aliceItem, bobItem, id } = await setup();
    await ctx.db
      .update(schema.listings)
      .set({ status: 'paused' })
      .where(eq(schema.listings.id, aliceItem.id));

    const res = await respond(app, bob.token, id, 'accept');
    expect(res.status).toBe(422);
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(0);
    expect(await listingStatus(bobItem.id)).toBe('published');
    const row = (await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, id)))[0];
    expect(row?.status).toBe('pending');
  });

  it('refuses when the requested item was taken in the meantime', async () => {
    const { app, bob, bobItem, id } = await setup();
    await ctx.db
      .update(schema.listings)
      .set({ status: 'traded' })
      .where(eq(schema.listings.id, bobItem.id));
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(422);
  });

  it('creates exactly one in-progress transaction, one conversation, and takes both items off the market', async () => {
    const { app, alice, bob, aliceItem, bobItem, id } = await setup();
    const res = await respond(app, bob.token, id, 'accept');
    expect(res.status).toBe(200);

    const txs = await ctx.db.select().from(schema.barterTransactions);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      offerId: id,
      status: 'in_progress',
      initiatedByUserId: alice.user.id,
      counterpartyUserId: bob.user.id,
    });
    expect(await ctx.db.select().from(schema.conversations)).toHaveLength(1);
    expect(await ctx.db.select().from(schema.conversationParticipants)).toHaveLength(2);
    expect(await listingStatus(aliceItem.id)).toBe('traded');
    expect(await listingStatus(bobItem.id)).toBe('traded');
    expect(await notificationsOf(alice.user.id, 'offer_accepted')).toHaveLength(1);
    const events = await ctx.db.select().from(schema.barterTransactionEvents);
    expect(events.map((e) => e.type)).toEqual(['accepted']);
  });

  it('is idempotent: repeating the accept returns success and creates nothing twice', async () => {
    const { app, alice, bob, id } = await setup();
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(200);
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(200);
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(200);

    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(1);
    expect(await ctx.db.select().from(schema.conversations)).toHaveLength(1);
    expect(await ctx.db.select().from(schema.barterTransactionEvents)).toHaveLength(1);
    expect(await notificationsOf(alice.user.id, 'offer_accepted')).toHaveLength(1);
  });

  it('converges under overlapping accept requests (one transaction, one conversation, no server errors)', async () => {
    const { app, bob, id } = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => respond(app, bob.token, id, 'accept')),
    );
    expect(results.every((r) => r.status === 200 || r.status === 422)).toBe(true);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(1);
    expect(await ctx.db.select().from(schema.conversations)).toHaveLength(1);
  });

  it('repairs an accept that crashed after the status change (retry and plain read both heal it)', async () => {
    const { app, alice, bob, id } = await setup();
    // Simulate: the compare-and-swap committed, the follow-up writes never ran.
    await ctx.db
      .update(schema.offers)
      .set({ status: 'accepted', respondedAt: Date.now() })
      .where(eq(schema.offers.id, id));
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(0);

    // A plain read by either party heals it.
    const read = await app.request(`/api/v1/offers/${id}`, { headers: H(alice.token) }, testEnv);
    expect(read.status).toBe(200);
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(1);
    expect(await ctx.db.select().from(schema.conversations)).toHaveLength(1);

    // …and a retried accept afterwards changes nothing further.
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(200);
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(1);
  });

  it('cancels competing pending offers for the same item and notifies their senders', async () => {
    const { app, bob, bobItem, id } = await setup();
    const carol = await user(app, 'Carol');
    const carolItem = await listing(app, carol.token, 'Photo shoot');
    const rival = await sendOffer(app, carol.token, {
      offeredListingId: carolItem.id,
      requestedListingId: bobItem.id,
    });
    const rivalId = await offerId(rival);

    expect((await respond(app, bob.token, id, 'accept')).status).toBe(200);
    const rivalRow = (
      await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, rivalId))
    )[0];
    expect(rivalRow?.status).toBe('cancelled');
    expect(await notificationsOf(carol.user.id, 'offer_cancelled')).toHaveLength(1);
    // The rival can no longer be accepted.
    expect((await respond(app, bob.token, rivalId, 'accept')).status).toBe(422);
  });

  it('only the recipient may accept; a stranger gets 404', async () => {
    const { app, alice, id } = await setup();
    expect((await respond(app, alice.token, id, 'accept')).status).toBe(403);
    const eve = await user(app, 'Eve');
    expect((await respond(app, eve.token, id, 'accept')).status).toBe(404);
  });
});

describe('rejecting and withdrawing', () => {
  it('reject and withdraw are idempotent and cannot undo an accepted offer', async () => {
    const { app, alice, bob, id } = await setup();
    expect((await respond(app, bob.token, id, 'reject')).status).toBe(200);
    expect((await respond(app, bob.token, id, 'reject')).status).toBe(200); // retry
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(422); // closed for good
    expect((await respond(app, alice.token, id, 'cancel')).status).toBe(422);
    expect(await notificationsOf(alice.user.id, 'offer_rejected')).toHaveLength(1);
  });

  it('a withdrawn offer cannot then be accepted, and an accepted one cannot be withdrawn', async () => {
    const { app, alice, bob, id } = await setup();
    expect((await respond(app, alice.token, id, 'cancel')).status).toBe(200);
    expect((await respond(app, bob.token, id, 'accept')).status).toBe(422);

    const second = await setup();
    await respond(second.app, second.bob.token, second.id, 'accept');
    expect((await respond(second.app, second.alice.token, second.id, 'cancel')).status).toBe(422);
  });
});

describe('creating offers', () => {
  it('rejects an expiry in the past', async () => {
    const { app, alice, aliceItem, bobItem } = await setup();
    const res = await sendOffer(app, alice.token, {
      offeredListingId: aliceItem.id,
      requestedListingId: bobItem.id,
      expiresAt: Date.now() - 5000,
    });
    expect(res.status).toBe(422);
  });

  it('honours an Idempotency-Key: a replay returns the same offer, never a second one', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bob');
    const a = await listing(app, alice.token, 'Logo design');
    const b = await listing(app, bob.token, 'Copywriting');
    const body = { offeredListingId: a.id, requestedListingId: b.id };

    const first = await sendOffer(app, alice.token, body, { 'Idempotency-Key': 'retry-key-0001' });
    const second = await sendOffer(app, alice.token, body, { 'Idempotency-Key': 'retry-key-0001' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await offerId(second)).toBe(await offerId(first));
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(1);
    expect(await notificationsOf(bob.user.id, 'offer_received')).toHaveLength(1);
  });

  it('treats overlapping identical submissions as one offer', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bob');
    const a = await listing(app, alice.token, 'Logo design');
    const b = await listing(app, bob.token, 'Copywriting');
    const body = { offeredListingId: a.id, requestedListingId: b.id };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        sendOffer(app, alice.token, body, { 'Idempotency-Key': 'overlap-key-01' }),
      ),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201 || r.status === 422)).toBe(
      true,
    );
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(1);
  });

  it('rejects reusing a key for a different offer, and malformed keys', async () => {
    const { app, alice, aliceItem } = await setup();
    const carol = await user(app, 'Carol');
    const other = await listing(app, carol.token, 'Photo shoot');
    await sendOffer(
      app,
      alice.token,
      { offeredListingId: aliceItem.id, requestedListingId: other.id },
      { 'Idempotency-Key': 'shared-key-001' },
    );
    const clash = await sendOffer(
      app,
      alice.token,
      {
        offeredListingId: aliceItem.id,
        requestedListingId: (await listing(app, carol.token, 'Another thing')).id,
      },
      { 'Idempotency-Key': 'shared-key-001' },
    );
    expect(clash.status).toBe(409);
    const bad = await sendOffer(
      app,
      alice.token,
      { offeredListingId: aliceItem.id, requestedListingId: other.id },
      { 'Idempotency-Key': 'x' },
    );
    expect(bad.status).toBe(400);
  });

  it('the database itself forbids two pending offers from one sender for one item', async () => {
    const { alice, aliceItem, bobItem, bob } = await setup();
    const another = await listing(ctx.makeApp(), alice.token, 'Second thing');
    await expect(
      ctx.db.insert(schema.offers).values({
        id: newId('offer'),
        fromUserId: alice.user.id,
        toUserId: bob.user.id,
        offeredListingId: another.id,
        requestedListingId: bobItem.id,
        status: 'pending',
      }),
    ).rejects.toThrow();
    // …but a closed offer does not block a fresh one.
    await ctx.db
      .update(schema.offers)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(schema.offers.fromUserId, alice.user.id),
          eq(schema.offers.offeredListingId, aliceItem.id),
        ),
      );
    await ctx.db.insert(schema.offers).values({
      id: newId('offer'),
      fromUserId: alice.user.id,
      toUserId: bob.user.id,
      offeredListingId: another.id,
      requestedListingId: bobItem.id,
      status: 'pending',
    });
  });
});

describe('completing a trade needs both parties', () => {
  it('one party alone can never complete it, however often they confirm', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;

    for (const action of ['confirm', 'confirm', 'complete', 'complete']) {
      const res = await txAction(app, alice.token, tx.id, action);
      expect(res.status).toBe(200);
      const view = (await json<Ok<{ transaction: { status: string } }>>(res)).data.transaction;
      expect(view.status).toBe('in_progress');
    }
    const row = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(row.status).toBe('in_progress');
    expect(row.completedAt).toBeNull();
    expect(row.initiatorConfirmedAt).not.toBeNull();
    expect(row.counterpartyConfirmedAt).toBeNull();
    // The partner is told it is their turn — exactly once.
    expect(
      (await notificationsOf(bob.user.id, 'transaction_updated')).filter(
        (n) => dataOf(n).status === 'awaiting_confirmation',
      ),
    ).toHaveLength(1);
  });

  it('completes when both confirm, records who did what, and unlocks reviews', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;

    await txAction(app, alice.token, tx.id, 'confirm');
    const done = await txAction(app, bob.token, tx.id, 'confirm');
    const view = (
      await json<
        Ok<{
          transaction: {
            status: string;
            confirmedByMe: boolean;
            confirmedByCounterparty: boolean;
            events: { type: string; actorIsMe: boolean | null }[];
          };
        }>
      >(done)
    ).data.transaction;
    expect(view).toMatchObject({
      status: 'completed',
      confirmedByMe: true,
      confirmedByCounterparty: true,
    });
    // accepted (Bob), confirmed (Alice), confirmed (Bob), completed (Bob)
    expect(view.events.map((e) => e.type)).toEqual([
      'accepted',
      'confirmed',
      'confirmed',
      'completed',
    ]);
    expect(view.events.map((e) => e.actorIsMe)).toEqual([true, false, true, true]);

    const review = await app.request(
      '/api/v1/reviews',
      {
        method: 'POST',
        headers: H(bob.token),
        body: JSON.stringify({ transactionId: tx.id, rating: 5 }),
      },
      testEnv,
    );
    expect(review.status).toBe(201);
    // Items stay traded after completion.
    expect((await ctx.db.select().from(schema.listings)).every((l) => l.status === 'traded')).toBe(
      true,
    );
  });

  it('completes exactly once when both confirm at the same moment', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    const results = await Promise.all([
      txAction(app, alice.token, tx.id, 'confirm'),
      txAction(app, bob.token, tx.id, 'confirm'),
      txAction(app, alice.token, tx.id, 'confirm'),
      txAction(app, bob.token, tx.id, 'confirm'),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    const row = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(row.status).toBe('completed');
    const events = await ctx.db.select().from(schema.barterTransactionEvents);
    expect(events.filter((e) => e.type === 'completed')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'confirmed')).toHaveLength(2);
  });

  it('strangers cannot confirm or cancel (404), and unknown actions are rejected', async () => {
    const { app, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    const eve = await user(app, 'Eve');
    expect((await txAction(app, eve.token, tx.id, 'confirm')).status).toBe(404);
    expect((await txAction(app, eve.token, tx.id, 'cancel')).status).toBe(404);
    expect((await txAction(app, bob.token, tx.id, 'finish-it')).status).toBe(422);
  });

  it('a legacy transaction row still in "created" can be started and then confirmed', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    await ctx.db
      .update(schema.barterTransactions)
      .set({ status: 'created' })
      .where(eq(schema.barterTransactions.id, tx.id));

    const started = await txAction(app, alice.token, tx.id, 'start');
    expect(
      (await json<Ok<{ transaction: { status: string } }>>(started)).data.transaction.status,
    ).toBe('in_progress');
    expect((await txAction(app, alice.token, tx.id, 'start')).status).toBe(200); // idempotent
    await txAction(app, alice.token, tx.id, 'confirm');
    const done = await txAction(app, bob.token, tx.id, 'confirm');
    expect(
      (await json<Ok<{ transaction: { status: string } }>>(done)).data.transaction.status,
    ).toBe('completed');
  });
});

describe('cancelling a trade', () => {
  it('puts both items back on the market, tells the partner, and records the event', async () => {
    const { app, alice, bob, aliceItem, bobItem, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(await listingStatus(aliceItem.id)).toBe('traded');

    const res = await txAction(app, alice.token, tx.id, 'cancel');
    expect(res.status).toBe(200);
    expect(await listingStatus(aliceItem.id)).toBe('published');
    expect(await listingStatus(bobItem.id)).toBe('published');
    const row = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(row.status).toBe('cancelled');
    expect(row.cancelledAt).not.toBeNull();
    expect(
      (await ctx.db.select().from(schema.barterTransactionEvents)).map((e) => e.type).sort(),
    ).toEqual(['accepted', 'cancelled']);
    expect(
      (await notificationsOf(bob.user.id, 'transaction_updated')).some(
        (n) => dataOf(n).status === 'cancelled',
      ),
    ).toBe(true);

    // The freed items can be offered again.
    const again = await sendOffer(app, alice.token, {
      offeredListingId: aliceItem.id,
      requestedListingId: bobItem.id,
    });
    expect(again.status).toBe(201);
  });

  it('is idempotent, blocks later confirmation, and cannot undo a completed trade', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;

    expect((await txAction(app, alice.token, tx.id, 'cancel')).status).toBe(200);
    expect((await txAction(app, alice.token, tx.id, 'cancel')).status).toBe(200);
    expect((await txAction(app, bob.token, tx.id, 'confirm')).status).toBe(422);

    const second = await setup();
    await respond(second.app, second.bob.token, second.id, 'accept');
    const tx2 = (await ctx.db.select().from(schema.barterTransactions)).find(
      (t) => t.offerId === second.id,
    )!;
    await txAction(second.app, second.alice.token, tx2.id, 'confirm');
    await txAction(second.app, second.bob.token, tx2.id, 'confirm');
    expect((await txAction(second.app, second.alice.token, tx2.id, 'cancel')).status).toBe(422);
  });

  it('does not resurrect an item the owner archived after the trade began', async () => {
    const { app, alice, bob, aliceItem, bobItem, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    await ctx.db
      .update(schema.listings)
      .set({ status: 'archived' })
      .where(eq(schema.listings.id, aliceItem.id));
    await txAction(app, alice.token, tx.id, 'cancel');
    expect(await listingStatus(aliceItem.id)).toBe('archived');
    expect(await listingStatus(bobItem.id)).toBe('published');
  });

  it('a racing cancel and double-confirm leave exactly one terminal state', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    await Promise.all([
      txAction(app, alice.token, tx.id, 'confirm'),
      txAction(app, bob.token, tx.id, 'confirm'),
      txAction(app, alice.token, tx.id, 'cancel'),
    ]);
    const row = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(['completed', 'cancelled']).toContain(row.status);
    const events = await ctx.db.select().from(schema.barterTransactionEvents);
    const terminal = events.filter((e) => e.type === 'completed' || e.type === 'cancelled');
    expect(terminal).toHaveLength(1);
    expect(terminal[0]!.type).toBe(row.status);
  });
});

describe('compare-and-swap guards at the SQL level', () => {
  it('only the first of several acceptIfPending calls gets the row', async () => {
    const { id } = await setup();
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    const now = Date.now();
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => repos.offers.acceptIfPending(id, now)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    // And it refuses an offer already past its expiry even if still "pending".
    const second = await setup();
    await ctx.db
      .update(schema.offers)
      .set({ expiresAt: now - 1 })
      .where(eq(schema.offers.id, second.id));
    expect(await repos.offers.acceptIfPending(second.id, now)).toBeNull();
  });

  it('completeIfBothConfirmed and cancelAndRestore are mutually exclusive', async () => {
    const { app, alice, bob, id } = await setup();
    await respond(app, bob.token, id, 'accept');
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    await repos.barterEngine.confirm(tx.id, 'initiator', alice.user.id);
    await repos.barterEngine.confirm(tx.id, 'counterparty', bob.user.id);
    const [completed, cancelled] = await Promise.all([
      repos.barterEngine.completeIfBothConfirmed(tx.id, bob.user.id),
      repos.barterEngine.cancelAndRestore(tx.id, alice.user.id),
    ]);
    expect([completed, cancelled].filter((r) => r !== null)).toHaveLength(1);
  });
});
