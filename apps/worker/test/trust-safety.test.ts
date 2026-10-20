/**
 * Milestone 4 — trust and safety: blocking (enforced server-side everywhere a
 * person can reach another), the report workflow, and a privacy audit that
 * walks every read endpoint looking for data that must never leave the server.
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
type Err = { ok: false; error: { code: string; message: string } };
const json = <T>(r: Response) => r.json() as Promise<T>;
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

async function user(app: App, name: string, email?: string): Promise<AuthSession> {
  const r = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email ?? `${name.toLowerCase()}${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a valid pw 12',
        displayName: name,
      }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(r)).data;
}

async function item(
  app: App,
  token: string,
  title: string,
  kind: 'listings' | 'needs' = 'listings',
  extra: Record<string, unknown> = {},
): Promise<MarketItem> {
  const r = await app.request(
    `/api/v1/${kind}`,
    {
      method: 'POST',
      headers: H(token),
      body: JSON.stringify({
        categoryId: catId,
        type: 'service',
        title,
        description: 'A perfectly good thing to trade.',
        status: 'published',
        ...extra,
      }),
    },
    testEnv,
  );
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<Ok<{ item: MarketItem }>>(r)).data.item;
}

const api = (app: App, token: string | null, method: string, path: string, body?: unknown) =>
  app.request(
    `/api/v1${path}`,
    {
      method,
      headers: token ? H(token) : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    testEnv,
  );
const data = async <T>(r: Response) => (await json<Ok<T>>(r)).data;
const errorOf = async (r: Response) => (await json<Err>(r)).error;
const notificationsOf = async (userId: string, type: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === type,
  );
const offerId = async (r: Response) => (await data<{ offer: { id: string } }>(r)).offer.id;

/* ----------------------------------------------------------------------- */
/* Blocking                                                                 */
/* ----------------------------------------------------------------------- */

describe('blocking: the list and the rules of the API', () => {
  it('requires authentication', async () => {
    const app = ctx.makeApp();
    for (const [m, p] of [
      ['GET', '/blocks'],
      ['PUT', `/blocks/${newId('user')}`],
      ['DELETE', `/blocks/${newId('user')}`],
    ] as const) {
      expect((await api(app, null, m, p)).status).toBe(401);
    }
  });

  it('blocks, lists, and unblocks — idempotently, and privately', async () => {
    const app = ctx.makeApp();
    const bea = await user(app, 'Bea');
    const sam = await user(app, 'Sam');

    expect((await api(app, bea.token, 'PUT', `/blocks/${sam.user.id}`)).status).toBe(200);
    expect((await api(app, bea.token, 'PUT', `/blocks/${sam.user.id}`)).status).toBe(200);
    expect(await ctx.db.select().from(schema.userBlocks)).toHaveLength(1);

    const mine = await data<{ items: { user: { id: string; displayName: string } }[] }>(
      await api(app, bea.token, 'GET', '/blocks'),
    );
    expect(mine.items.map((i) => i.user.id)).toEqual([sam.user.id]);
    // The blocked person sees no trace of it.
    const theirs = await data<{ items: unknown[] }>(await api(app, sam.token, 'GET', '/blocks'));
    expect(theirs.items).toEqual([]);

    expect((await api(app, bea.token, 'DELETE', `/blocks/${sam.user.id}`)).status).toBe(200);
    expect((await api(app, bea.token, 'DELETE', `/blocks/${sam.user.id}`)).status).toBe(200);
    expect(await ctx.db.select().from(schema.userBlocks)).toHaveLength(0);
  });

  it('refuses self-blocks and unknown users; the blocked person cannot lift the block', async () => {
    const app = ctx.makeApp();
    const bea = await user(app, 'Bea');
    const sam = await user(app, 'Sam');
    expect((await api(app, bea.token, 'PUT', `/blocks/${bea.user.id}`)).status).toBe(422);
    expect((await api(app, bea.token, 'PUT', `/blocks/${newId('user')}`)).status).toBe(404);

    await api(app, bea.token, 'PUT', `/blocks/${sam.user.id}`);
    // Sam "unblocking" Bea only removes a (non-existent) block Sam placed.
    await api(app, sam.token, 'DELETE', `/blocks/${bea.user.id}`);
    expect(await ctx.db.select().from(schema.userBlocks)).toHaveLength(1);
  });

  it('survives overlapping block requests', async () => {
    const app = ctx.makeApp();
    const bea = await user(app, 'Bea');
    const sam = await user(app, 'Sam');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api(app, bea.token, 'PUT', `/blocks/${sam.user.id}`)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await ctx.db.select().from(schema.userBlocks)).toHaveLength(1);
  });
});

describe('blocking: enforced where people reach each other', () => {
  async function pair() {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    return { app, alice, bob, a, b };
  }

  it('stops offers in both directions, with wording that does not reveal who blocked whom', async () => {
    const { app, alice, bob, a, b } = await pair();
    await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);

    // The person who was blocked is told only that the other person is unavailable.
    const blocked = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    expect(blocked.status).toBe(403);
    expect((await errorOf(blocked)).message).toBe('This person is not available.');

    // The blocker is reminded they blocked them.
    const mine = await api(app, bob.token, 'POST', '/offers', {
      offeredListingId: b.id,
      requestedListingId: a.id,
    });
    expect(mine.status).toBe(403);
    expect((await errorOf(mine)).message).toMatch(/you have blocked/i);
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(0);

    // Unblocking restores trading.
    await api(app, bob.token, 'DELETE', `/blocks/${alice.user.id}`);
    expect(
      (
        await api(app, alice.token, 'POST', '/offers', {
          offeredListingId: a.id,
          requestedListingId: b.id,
        })
      ).status,
    ).toBe(201);
  });

  it('withdraws pending offers between the two — silently — when a block is placed', async () => {
    const { app, alice, bob, a, b } = await pair();
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    const res = await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);
    expect((await data<{ withdrawnOffers: number }>(res)).withdrawnOffers).toBe(1);
    const row = (await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, id)))[0]!;
    expect(row.status).toBe('cancelled');
    // Alice must not learn she was blocked from a notification.
    expect(await notificationsOf(alice.user.id, 'offer_cancelled')).toHaveLength(0);
  });

  it('refuses to accept or counter an offer once either side has blocked the other', async () => {
    const { app, alice, bob, a, b } = await pair();
    const b2 = await item(app, bob.token, 'Bob other thing');
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    // A block that did not go through the API (e.g. placed by a concurrent request).
    await ctx.db
      .insert(schema.userBlocks)
      .values({ blockerId: alice.user.id, blockedId: bob.user.id });
    const accept = await api(app, bob.token, 'POST', `/offers/${id}/respond`, { action: 'accept' });
    expect(accept.status).toBe(403);
    const counter = await api(app, bob.token, 'POST', `/offers/${id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a.id,
    });
    expect(counter.status).toBe(403);
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(0);
    expect(
      (await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, id)))[0]!.status,
    ).toBe('pending');
  });

  it('ends messaging in both directions but leaves history readable and the trade finishable', async () => {
    const { app, alice, bob, a, b } = await pair();
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, bob.token, 'POST', `/offers/${id}/respond`, { action: 'accept' });
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const send = (token: string, body: string) =>
      api(app, token, 'POST', `/conversations/${conv.id}/messages`, { body });
    expect((await send(alice.token, 'hello')).status).toBe(201);

    await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);
    expect((await send(alice.token, 'are you there?')).status).toBe(403);
    expect((await send(bob.token, 'go away')).status).toBe(403);
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(1);

    // History is still readable…
    const msgs = await data<{ items: { body: string }[] }>(
      await api(app, alice.token, 'GET', `/conversations/${conv.id}/messages`),
    );
    expect(msgs.items.map((m) => m.body)).toEqual(['hello']);
    // …the committed trade is untouched, and either side can still finish or cancel it.
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(tx.status).toBe('in_progress');
    expect(
      (await api(app, alice.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' }))
        .status,
    ).toBe(200);
    expect(
      (await api(app, bob.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' }))
        .status,
    ).toBe(200);
    expect((await ctx.db.select().from(schema.barterTransactions))[0]!.status).toBe('completed');
  });

  it('hides each other’s listings and requests from discovery and detail pages — both ways', async () => {
    const { app, alice, bob, a, b } = await pair();
    const need = await item(app, bob.token, 'Bob needs a thing', 'needs');
    const carol = await user(app, 'Carol');
    const c1 = await item(app, carol.token, 'Carol thing');
    await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);

    const titles = async (token: string, path: string) =>
      (await data<{ items: MarketItem[] }>(await api(app, token, 'GET', path))).items.map(
        (i) => i.id,
      );

    // Alice no longer sees Bob's items; Bob no longer sees Alice's.
    expect(await titles(alice.token, '/listings')).toEqual(expect.arrayContaining([a.id, c1.id]));
    expect(await titles(alice.token, '/listings')).not.toContain(b.id);
    expect(await titles(bob.token, '/listings')).toEqual(expect.not.arrayContaining([a.id]));
    expect(await titles(alice.token, '/needs')).toEqual([]);
    expect((await api(app, alice.token, 'GET', `/listings/${b.id}`)).status).toBe(404);
    expect((await api(app, alice.token, 'GET', `/needs/${need.id}`)).status).toBe(404);
    expect((await api(app, bob.token, 'GET', `/listings/${a.id}`)).status).toBe(404);
    // A third person is unaffected, and an owner always sees their own.
    expect(await titles(carol.token, '/listings')).toEqual(expect.arrayContaining([a.id, b.id]));
    expect((await api(app, bob.token, 'GET', `/listings/${b.id}`)).status).toBe(200);

    // Unblocking brings everything back.
    await api(app, bob.token, 'DELETE', `/blocks/${alice.user.id}`);
    expect(await titles(alice.token, '/listings')).toEqual(expect.arrayContaining([b.id, c1.id]));
    expect((await api(app, alice.token, 'GET', `/listings/${b.id}`)).status).toBe(200);
  });

  it('hides blocked people from recommendations, matches, saved lists and need alerts', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const carol = await user(app, 'Carol');
    const b = await item(app, bob.token, 'Bob thing');
    const c1 = await item(app, carol.token, 'Carol thing');

    // Saved lists: Alice saves Bob's listing, then Bob blocks Alice.
    await api(app, alice.token, 'PUT', `/favourites/${b.id}`);
    // Reciprocal match shape: Alice has a design listing and needs design; Bob the reverse.
    await item(app, alice.token, 'Alice offers design');
    await item(app, alice.token, 'Alice needs design', 'needs');
    await item(app, bob.token, 'Bob needs design', 'needs');
    await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);

    const rec = await data<{ items: MarketItem[] }>(
      await api(app, alice.token, 'GET', '/recommendations'),
    );
    expect(rec.items.map((i) => i.id)).toEqual(expect.not.arrayContaining([b.id]));
    expect(rec.items.map((i) => i.id)).toContain(c1.id);

    const saved = await data<{ items: MarketItem[] }>(
      await api(app, alice.token, 'GET', '/favourites'),
    );
    expect(saved.items).toEqual([]);
    expect((await api(app, alice.token, 'PUT', `/favourites/${b.id}`)).status).toBe(404);

    const matches = await data<{ items: { counterparty?: { id: string } }[] }>(
      await api(app, alice.token, 'GET', '/matches'),
    );
    expect(JSON.stringify(matches)).not.toContain(bob.user.id);

    // Need alerts: a request from Bob must not alert Alice (blocked), but still alerts Carol.
    await ctx.db.delete(schema.notifications);
    await item(app, bob.token, 'Bob needs a service', 'needs');
    expect(await notificationsOf(alice.user.id, 'need_match')).toHaveLength(0);
    expect(await notificationsOf(carol.user.id, 'need_match')).toHaveLength(1);
  });
});

/* ----------------------------------------------------------------------- */
/* Report workflow                                                          */
/* ----------------------------------------------------------------------- */

describe('reports', () => {
  const report = (app: App, token: string, body: Record<string, unknown>) =>
    api(app, token, 'POST', '/reports', { reason: 'spam', ...body });

  it('is idempotent per (reporter, subject): a repeat returns the open report; racing repeats make one', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    const l = await item(app, owner.token, 'Dodgy listing');

    const first = await report(app, me.token, { subjectType: 'listing', subjectId: l.id });
    expect(first.status).toBe(201);
    const second = await report(app, me.token, {
      subjectType: 'listing',
      subjectId: l.id,
      reason: 'scam',
    });
    expect(second.status).toBe(200);
    const a = await data<{ report: { id: string }; duplicate: boolean }>(first);
    const b = await data<{ report: { id: string }; duplicate: boolean }>(second);
    expect(b.report.id).toBe(a.report.id);
    expect(b.duplicate).toBe(true);

    const racing = await Promise.all(
      Array.from({ length: 4 }, () =>
        report(app, me.token, { subjectType: 'user', subjectId: owner.user.id }),
      ),
    );
    expect(racing.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(await ctx.db.select().from(schema.reports)).toHaveLength(2);
  });

  it('allows a fresh report once the earlier one has been closed', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    const first = await report(app, me.token, { subjectType: 'user', subjectId: owner.user.id });
    const id = (await data<{ report: { id: string } }>(first)).report.id;
    await ctx.db
      .update(schema.reports)
      .set({ status: 'resolved' })
      .where(eq(schema.reports.id, id));
    expect(
      (await report(app, me.token, { subjectType: 'user', subjectId: owner.user.id })).status,
    ).toBe(201);
  });

  it('keeps the evidence as it was when reported, even if the content changes or disappears', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    const l = await item(app, owner.token, 'Original shady title');
    const res = await report(app, me.token, { subjectType: 'listing', subjectId: l.id });
    const id = (await data<{ report: { id: string } }>(res)).report.id;

    await api(app, owner.token, 'PATCH', `/listings/${l.id}`, {
      title: 'Perfectly innocent title',
    });
    await api(app, owner.token, 'DELETE', `/listings/${l.id}`);
    const row = (await ctx.db.select().from(schema.reports).where(eq(schema.reports.id, id)))[0]!;
    const snap = JSON.parse(row.subjectSnapshot!) as { title: string; ownerId: string };
    expect(snap.title).toBe('Original shady title');
    expect(snap.ownerId).toBe(owner.user.id);
  });

  it('captures a message excerpt, and only participants can report a message', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, bob.token, 'POST', `/offers/${id}/respond`, { action: 'accept' });
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const sent = await api(app, alice.token, 'POST', `/conversations/${conv.id}/messages`, {
      body: 'send me money now',
    });
    const msgId = (await data<{ message: { id: string } }>(sent)).message.id;

    expect(
      (await report(app, eve.token, { subjectType: 'message', subjectId: msgId })).status,
    ).toBe(404);
    expect(
      (await report(app, alice.token, { subjectType: 'message', subjectId: msgId })).status,
    ).toBe(422); // own message
    const ok = await report(app, bob.token, {
      subjectType: 'message',
      subjectId: msgId,
      reason: 'scam',
    });
    expect(ok.status).toBe(201);
    const row = (await ctx.db.select().from(schema.reports))[0]!;
    expect(JSON.parse(row.subjectSnapshot!)).toMatchObject({
      body: 'send me money now',
      senderId: alice.user.id,
    });
  });

  it('refuses reports about yourself, your own items, strangers’ transactions, and things you cannot see', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    const own = await item(app, me.token, 'My own thing');
    const draft = await item(app, owner.token, 'Secret draft', 'listings', { status: 'draft' });
    const live = await item(app, owner.token, 'Public thing');

    expect(
      (await report(app, me.token, { subjectType: 'user', subjectId: me.user.id })).status,
    ).toBe(422);
    expect(
      (await report(app, me.token, { subjectType: 'listing', subjectId: own.id })).status,
    ).toBe(422);
    // Existence of a private draft is not revealed to a stranger.
    expect(
      (await report(app, me.token, { subjectType: 'listing', subjectId: draft.id })).status,
    ).toBe(404);
    expect(
      (await report(app, me.token, { subjectType: 'listing', subjectId: newId('listing') })).status,
    ).toBe(404);
    expect(
      (
        await report(app, me.token, {
          subjectType: 'transaction',
          subjectId: newId('barterTransaction'),
        })
      ).status,
    ).toBe(404);

    // …but a published item is reportable, and so is a hidden one if you were in a trade on it.
    expect(
      (await report(app, me.token, { subjectType: 'listing', subjectId: live.id })).status,
    ).toBe(201);
    const mine = await item(app, me.token, 'Mine to offer');
    await api(app, me.token, 'POST', '/offers', {
      offeredListingId: mine.id,
      requestedListingId: live.id,
    });
    await ctx.db
      .update(schema.listings)
      .set({ status: 'paused' })
      .where(eq(schema.listings.id, live.id));
    await ctx.db.update(schema.reports).set({ status: 'resolved' });
    expect(
      (await report(app, me.token, { subjectType: 'listing', subjectId: live.id })).status,
    ).toBe(201);
  });

  it('does not let a report probe items hidden by a block', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    const l = await item(app, owner.token, 'Public thing');
    await api(app, owner.token, 'PUT', `/blocks/${me.user.id}`);
    expect((await report(app, me.token, { subjectType: 'listing', subjectId: l.id })).status).toBe(
      404,
    );
    // Reporting the PERSON is still possible — blocking must not silence a harassment report.
    expect(
      (await report(app, me.token, { subjectType: 'user', subjectId: owner.user.id })).status,
    ).toBe(201);
  });

  it('only a party can report a transaction', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, bob.token, 'POST', `/offers/${id}/respond`, { action: 'accept' });
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(
      (await report(app, eve.token, { subjectType: 'transaction', subjectId: tx.id })).status,
    ).toBe(404);
    expect(
      (await report(app, alice.token, { subjectType: 'transaction', subjectId: tx.id })).status,
    ).toBe(201);
  });

  it('caps how many reports one account can file in a day', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Mia');
    const targets = await Promise.all(
      Array.from({ length: 21 }, (_, i) => user(app, `Target${i}x`)),
    );
    for (const t of targets.slice(0, 20)) {
      expect(
        (await report(app, me.token, { subjectType: 'user', subjectId: t.user.id })).status,
      ).toBe(201);
    }
    const over = await report(app, me.token, {
      subjectType: 'user',
      subjectId: targets[20]!.user.id,
    });
    expect(over.status).toBe(429);
    expect((await errorOf(over)).code).toBe('too_many_requests');
    // A repeat of an existing report is still answered (it creates nothing).
    expect(
      (await report(app, me.token, { subjectType: 'user', subjectId: targets[0]!.user.id })).status,
    ).toBe(200);
  });

  it('never returns the stored evidence snapshot to the reporter-facing list', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const me = await user(app, 'Mia');
    await report(app, me.token, { subjectType: 'user', subjectId: owner.user.id });
    const body = JSON.stringify(await data(await api(app, me.token, 'GET', '/reports/mine')));
    expect(body).not.toContain('Snapshot');
    expect(body).not.toContain('displayName');
  });
});

/* ----------------------------------------------------------------------- */
/* Privacy audit                                                            */
/* ----------------------------------------------------------------------- */

/**
 * Plant recognisable private values on one user, let other people interact with
 * them through every feature, then read every endpoint as those other people
 * and fail if any private value — or any field that is private by name —
 * appears in a response. New endpoints must be added to the walk below.
 */
describe('privacy audit', () => {
  const CANARY_EMAIL = 'alice.private.canary@example.com';
  /** Field names that may appear only in the account owner's own responses. */
  const FORBIDDEN_KEYS = [
    'email',
    'password',
    'passwordHash',
    'hash',
    'salt',
    'tokenHash',
    'token',
    'sessionToken',
    'userAgent',
    'ipAddress',
    'identityVerification',
    'governmentIdVerifiedAt',
    'faceVerifiedAt',
    'objectKey',
    'avatarKey',
    'imageKey',
    'subjectSnapshot',
    'blockerId',
    'blockedId',
    'lastReadAt',
    'typingAt',
  ];

  function findForbidden(value: unknown, path = '$'): string[] {
    if (Array.isArray(value)) return value.flatMap((v, i) => findForbidden(v, `${path}[${i}]`));
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([k, v]) => [
        ...(FORBIDDEN_KEYS.includes(k) ? [`${path}.${k}`] : []),
        ...findForbidden(v, `${path}.${k}`),
      ]);
    }
    return [];
  }

  it('no read endpoint leaks another person’s private data', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice', CANARY_EMAIL);
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');

    // Give Alice a profile worth leaking.
    await api(app, alice.token, 'PATCH', '/profiles/me', {
      bio: 'Private-ish bio for the audit',
      locationCity: 'Pune',
    });

    // Interactions: listings, a need, an offer + counter, a trade with chat and a review, a report, a save.
    const a1 = await item(app, alice.token, 'Alice logo design');
    const a2 = await item(app, alice.token, 'Alice brand audit');
    const b1 = await item(app, bob.token, 'Bob copywriting');
    const b2 = await item(app, bob.token, 'Bob proofreading');
    const bobNeed = await item(app, bob.token, 'Bob needs a logo', 'needs');
    await api(app, bob.token, 'PUT', `/favourites/${a1.id}`);
    const first = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a1.id,
        requestedListingId: b1.id,
      }),
    );
    const counter = (
      await data<{ offer: { id: string } }>(
        await api(app, bob.token, 'POST', `/offers/${first}/counter`, {
          offeredListingId: b2.id,
          requestedListingId: a2.id,
        }),
      )
    ).offer.id;
    await api(app, alice.token, 'POST', `/offers/${counter}/respond`, { action: 'accept' });
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    await api(app, alice.token, 'POST', `/conversations/${conv.id}/messages`, {
      body: 'hello from Alice',
    });
    await api(app, bob.token, 'POST', `/conversations/${conv.id}/read`);
    await api(app, alice.token, 'POST', `/conversations/${conv.id}/typing`, {});
    await api(app, alice.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' });
    await api(app, bob.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' });
    await api(app, bob.token, 'POST', '/reviews', {
      transactionId: tx.id,
      rating: 5,
      comment: 'Great',
    });
    await api(app, bob.token, 'POST', '/reports', {
      subjectType: 'user',
      subjectId: alice.user.id,
      reason: 'spam',
    });
    await api(app, bob.token, 'POST', '/needs', {
      categoryId: catId,
      type: 'service',
      title: 'Another need',
      description: 'Need more help here.',
      status: 'published',
    });
    await api(app, eve.token, 'PUT', `/blocks/${alice.user.id}`);

    const msgId = (await ctx.db.select().from(schema.messages))[0]!.id;
    const endpoints = (viewer: string) =>
      [
        '/listings',
        `/listings/${a1.id}`,
        '/listings/mine',
        '/needs',
        `/needs/${bobNeed.id}`,
        '/needs/mine',
        '/offers/incoming',
        '/offers/outgoing',
        `/offers/${first}`,
        `/offers/${counter}`,
        `/offers/${counter}/history`,
        '/transactions',
        `/transactions/${tx.id}`,
        '/conversations',
        `/conversations/${conv.id}`,
        `/conversations/${conv.id}/messages`,
        `/conversations/${conv.id}/typing`,
        `/reviews/users/${alice.user.id}`,
        '/matches',
        '/recommendations',
        '/notifications',
        '/favourites',
        '/favourites/ids',
        '/blocks',
        '/reports/mine',
        `/reports/disputes/${tx.id}`,
        '/payments/mine',
        '/categories',
        '/listings/cities',
        void msgId,
        void viewer,
      ].filter((p): p is string => typeof p === 'string');

    const leaks: string[] = [];
    let inspected = 0;
    for (const [label, token] of [
      ['Bob', bob.token],
      ['Eve', eve.token],
    ] as const) {
      for (const path of endpoints(token)) {
        const res = await api(app, token, 'GET', path);
        const text = await res.text();
        // Alice's address and every session token must never appear in anyone else's response.
        for (const secret of [CANARY_EMAIL, alice.token, 'pbkdf2']) {
          if (text.includes(secret))
            leaks.push(`${label} ${path}: contains ${secret.slice(0, 12)}…`);
        }
        if (res.status === 200) {
          inspected += 1;
          for (const hit of findForbidden(JSON.parse(text))) leaks.push(`${label} ${path}: ${hit}`);
        }
      }
    }
    expect(leaks).toEqual([]);
    // The walk must really be reading content: most endpoints answer 200 for both viewers.
    expect(inspected).toBeGreaterThanOrEqual(40);
  });

  it('the detector itself flags forbidden fields and secrets (it is not vacuous)', () => {
    expect(findForbidden({ a: [{ owner: { email: 'x@y.z' } }], b: { avatarKey: 'k' } })).toEqual([
      '$.a[0].owner.email',
      '$.b.avatarKey',
    ]);
    expect(findForbidden({ items: [{ id: '1', displayName: 'Ann' }] })).toEqual([]);
  });

  it('the account owner’s own responses do carry their email — and nobody else’s', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice', CANARY_EMAIL);
    const me = await data<{ user: { email: string } }>(
      await api(app, alice.token, 'GET', '/auth/me'),
    );
    expect(me.user.email).toBe(CANARY_EMAIL);
    // …and the response to registering/logging in as someone else never contains it.
    const bob = await user(app, 'Bobby');
    expect(JSON.stringify(await data(await api(app, bob.token, 'GET', '/auth/me')))).not.toContain(
      CANARY_EMAIL,
    );
  });

  it('public profile references expose only name, handle, city and a media URL', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice', CANARY_EMAIL);
    const bob = await user(app, 'Bobby');
    await api(app, alice.token, 'PATCH', '/profiles/me', {
      bio: 'secret bio',
      locationCity: 'Pune',
    });
    const l = await item(app, alice.token, 'Alice thing');
    const seen = await data<{ item: MarketItem }>(
      await api(app, bob.token, 'GET', `/listings/${l.id}`),
    );
    expect(Object.keys(seen.item.owner).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'id',
      'locationCity',
      'username',
    ]);
    expect(JSON.stringify(seen)).not.toContain('secret bio');
  });

  it('a stranger cannot read a conversation, offer, transaction or the typing state of others', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const id = await offerId(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, bob.token, 'POST', `/offers/${id}/respond`, { action: 'accept' });
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    for (const path of [
      `/offers/${id}`,
      `/offers/${id}/history`,
      `/transactions/${tx.id}`,
      `/conversations/${conv.id}`,
      `/conversations/${conv.id}/messages`,
      `/conversations/${conv.id}/typing`,
      `/reports/disputes/${tx.id}`,
    ]) {
      expect((await api(app, eve.token, 'GET', path)).status, path).toBe(404);
    }
    void and;
  });
});
