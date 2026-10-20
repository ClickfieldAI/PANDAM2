/**
 * Milestone 2 — counter offers and negotiation history, through the real HTTP
 * routes against a real SQLite engine with the project's real migrations.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem, type OfferView } from '@pandam/types';
import { eq } from 'drizzle-orm';
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
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

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

async function listing(
  app: App,
  token: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<MarketItem> {
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
        ...extra,
      }),
    },
    testEnv,
  );
  expect(r.status, await r.clone().text()).toBe(201);
  return (await json<Ok<{ item: MarketItem }>>(r)).data.item;
}

const post = (app: App, token: string, path: string, body: unknown) =>
  app.request(
    `/api/v1${path}`,
    { method: 'POST', headers: H(token), body: JSON.stringify(body) },
    testEnv,
  );
const get = (app: App, token: string, path: string) =>
  app.request(`/api/v1${path}`, { headers: H(token) }, testEnv);
const offerOf = async (r: Response) => (await json<Ok<{ offer: OfferView }>>(r)).data.offer;
const notificationsOf = async (userId: string, type: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === type,
  );
const statusOf = async (id: string) =>
  (await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, id)))[0]?.status;

/** Alice offers A1 for Bob's B1; Alice also owns A2, Bob also owns B2. */
async function setup() {
  const app = ctx.makeApp();
  const alice = await user(app, 'Alice');
  const bob = await user(app, 'Bob');
  const a1 = await listing(app, alice.token, 'Logo design');
  const a2 = await listing(app, alice.token, 'Brand audit');
  const b1 = await listing(app, bob.token, 'Copywriting');
  const b2 = await listing(app, bob.token, 'Proofreading');
  const res = await post(app, alice.token, '/offers', {
    offeredListingId: a1.id,
    requestedListingId: b1.id,
  });
  expect(res.status).toBe(201);
  const offer = await offerOf(res);
  return { app, alice, bob, a1, a2, b1, b2, offer };
}

describe('countering an offer', () => {
  it('turns the original into "countered" and sends a linked reverse offer, leaving items untouched', async () => {
    const { app, alice, bob, a2, b2, a1, b1, offer } = await setup();
    const res = await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
      message: 'How about this instead?',
    });
    expect(res.status).toBe(201);
    const counter = await offerOf(res);

    expect(counter).toMatchObject({
      status: 'pending',
      isMine: true,
      parentOfferId: offer.id,
      message: 'How about this instead?',
    });
    expect(counter.fromUser.id).toBe(bob.user.id);
    expect(counter.toUser.id).toBe(alice.user.id);
    expect(counter.offered.id).toBe(b2.id);
    expect(counter.requested.id).toBe(a2.id);

    expect(await statusOf(offer.id)).toBe('countered');
    // Nothing is traded by negotiating.
    const listings = await ctx.db.select().from(schema.listings);
    expect(listings.every((l) => l.status === 'published')).toBe(true);
    expect(listings.map((l) => l.id)).toEqual(expect.arrayContaining([a1.id, b1.id]));
    expect(await ctx.db.select().from(schema.barterTransactions)).toHaveLength(0);

    // Alice is told, with a pointer to the NEW offer.
    const note = (await notificationsOf(alice.user.id, 'offer_countered'))[0]!;
    expect(JSON.parse(note.data!)).toEqual({ offerId: counter.id, previousOfferId: offer.id });

    // The original now points at its counter.
    const original = await offerOf(await get(app, alice.token, `/offers/${offer.id}`));
    expect(original).toMatchObject({ status: 'countered', counterOfferId: counter.id });
  });

  it('a counter can keep the same items (just a changed message or expiry)', async () => {
    const { app, bob, a1, b1, offer } = await setup();
    const res = await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b1.id,
      requestedListingId: a1.id,
      message: 'Same swap, but let us do it this week.',
      expiresAt: Date.now() + 7 * 86_400_000,
    });
    expect(res.status).toBe(201);
  });

  it('only the recipient may counter; a stranger gets 404; the original sender gets 403', async () => {
    const { app, alice, a1, b1, offer } = await setup();
    const body = { offeredListingId: b1.id, requestedListingId: a1.id };
    expect((await post(app, alice.token, `/offers/${offer.id}/counter`, body)).status).toBe(403);
    const eve = await user(app, 'Eve');
    expect((await post(app, eve.token, `/offers/${offer.id}/counter`, body)).status).toBe(404);
    expect(await statusOf(offer.id)).toBe('pending');
  });

  it('validates both ends: mine must be mine+published, theirs must be the sender’s+published, no sale-only', async () => {
    const { app, alice, bob, a1, a2, b2, offer } = await setup();
    const carol = await user(app, 'Carol');
    const carolItem = await listing(app, carol.token, 'Photo shoot');
    const sale = await listing(app, bob.token, 'A thing for sale', {
      transactionType: 'sale',
      priceAmount: 50_000,
    });
    const paused = await listing(app, bob.token, 'Paused thing');
    await ctx.db
      .update(schema.listings)
      .set({ status: 'paused' })
      .where(eq(schema.listings.id, paused.id));

    const attempts: Record<string, unknown>[] = [
      { offeredListingId: a2.id, requestedListingId: a1.id }, // offering the SENDER's item
      { offeredListingId: carolItem.id, requestedListingId: a1.id }, // someone else's item
      { offeredListingId: b2.id, requestedListingId: carolItem.id }, // asking a third party's item
      { offeredListingId: sale.id, requestedListingId: a1.id }, // sale-only
      { offeredListingId: paused.id, requestedListingId: a1.id }, // not published
      { offeredListingId: b2.id, requestedListingId: newId('listing') }, // nonexistent
    ];
    for (const body of attempts) {
      const res = await post(app, bob.token, `/offers/${offer.id}/counter`, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    // None of the failed attempts consumed the original offer.
    expect(await statusOf(offer.id)).toBe('pending');
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(1);
    void alice;
  });

  it('cannot counter an offer that is closed, expired, or a request for a need', async () => {
    const { app, alice, bob, a1, b1, b2, offer } = await setup();
    const body = { offeredListingId: b2.id, requestedListingId: a1.id };

    await post(app, alice.token, `/offers/${offer.id}/respond`, { action: 'cancel' });
    expect((await post(app, bob.token, `/offers/${offer.id}/counter`, body)).status).toBe(422);

    // Expired
    const second = await post(app, alice.token, '/offers', {
      offeredListingId: a1.id,
      requestedListingId: b1.id,
    });
    const secondId = (await offerOf(second)).id;
    await ctx.db
      .update(schema.offers)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(schema.offers.id, secondId));
    const late = await post(app, bob.token, `/offers/${secondId}/counter`, body);
    expect(late.status).toBe(422);
    expect(await statusOf(secondId)).toBe('expired');

    // A request for a NEED has no item on the recipient's side to swap.
    const need = await app.request(
      '/api/v1/needs',
      {
        method: 'POST',
        headers: H(bob.token),
        body: JSON.stringify({
          categoryId: catId,
          type: 'service',
          title: 'Need a logo',
          description: 'Looking for a clean logo for my cafe.',
          status: 'published',
        }),
      },
      testEnv,
    );
    const needId = (await json<Ok<{ item: MarketItem }>>(need)).data.item.id;
    const carol = await user(app, 'Carol');
    const carolItem = await listing(app, carol.token, 'Logo pack');
    const needOffer = await post(app, carol.token, '/offers', {
      offeredListingId: carolItem.id,
      requestedNeedId: needId,
    });
    const nid = (await offerOf(needOffer)).id;
    const res = await post(app, bob.token, `/offers/${nid}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: carolItem.id,
    });
    expect(res.status).toBe(422);
    expect((await json<{ error: { message: string } }>(res)).error.message).toMatch(
      /item-for-item/i,
    );
  });

  it('is idempotent: repeating the counter returns the same counter and creates no second one', async () => {
    const { app, bob, a2, b2, offer } = await setup();
    const body = { offeredListingId: b2.id, requestedListingId: a2.id };
    const first = await post(app, bob.token, `/offers/${offer.id}/counter`, body);
    const second = await post(app, bob.token, `/offers/${offer.id}/counter`, body);
    expect(first.status).toBe(201);
    expect(second.status).toBeLessThan(300);
    expect((await offerOf(second)).id).toBe((await offerOf(first)).id);
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(2);
  });

  it('overlapping identical counters converge on one counter-offer', async () => {
    const { app, alice, bob, a2, b2, offer } = await setup();
    const body = { offeredListingId: b2.id, requestedListingId: a2.id };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(app, bob.token, `/offers/${offer.id}/counter`, body)),
    );
    expect(results.every((r) => r.status === 201 || r.status === 200 || r.status === 422)).toBe(
      true,
    );
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(2);
    expect(await notificationsOf(alice.user.id, 'offer_countered')).toHaveLength(1);
  });

  it('a counter and an accept racing on the same offer have exactly one winner', async () => {
    const { app, bob, a2, b2, offer } = await setup();
    const [counter, accept] = await Promise.all([
      post(app, bob.token, `/offers/${offer.id}/counter`, {
        offeredListingId: b2.id,
        requestedListingId: a2.id,
      }),
      post(app, bob.token, `/offers/${offer.id}/respond`, { action: 'accept' }),
    ]);
    const final = await statusOf(offer.id);
    expect(['accepted', 'countered']).toContain(final);
    const txs = await ctx.db.select().from(schema.barterTransactions);
    if (final === 'accepted') {
      expect(txs).toHaveLength(1);
      expect(counter.status).toBe(422);
    } else {
      expect(txs).toHaveLength(0);
      expect(accept.status).toBe(422);
    }
  });

  it('reopenIfNoChild restores an orphaned "countered" offer but never one that has a counter', async () => {
    const { app, bob, a2, b2, offer } = await setup();
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);

    // Orphan: flipped to countered, but no counter was ever created.
    await ctx.db
      .update(schema.offers)
      .set({ status: 'countered' })
      .where(eq(schema.offers.id, offer.id));
    await repos.offers.reopenIfNoChild(offer.id);
    expect(await statusOf(offer.id)).toBe('pending');

    // With a real counter in place, reopening is a no-op.
    await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    await repos.offers.reopenIfNoChild(offer.id);
    expect(await statusOf(offer.id)).toBe('countered');
  });

  it('refuses a counter that would duplicate a pending request, leaving the original open', async () => {
    const { app, bob, a2, b2, offer } = await setup();
    // Bob already has a pending offer for a2.
    await ctx.db.insert(schema.offers).values({
      id: newId('offer'),
      fromUserId: bob.user.id,
      toUserId: (await ctx.db.select().from(schema.offers))[0]!.fromUserId,
      offeredListingId: b2.id,
      requestedListingId: a2.id,
      status: 'pending',
    });
    const res = await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    expect(res.status).toBe(422);
    expect(await statusOf(offer.id)).toBe('pending');
  });

  it('heals a counter that crashed after flipping the original to "countered"', async () => {
    const { app, alice, bob, a2, b2, offer } = await setup();
    await ctx.db
      .update(schema.offers)
      .set({ status: 'countered' })
      .where(eq(schema.offers.id, offer.id));
    const res = await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    expect(res.status).toBe(201);
    const counter = await offerOf(res);
    expect(counter.parentOfferId).toBe(offer.id);
    expect(await notificationsOf(alice.user.id, 'offer_countered')).toHaveLength(1);
  });
});

describe('what happens after a counter', () => {
  it('the original can no longer be accepted, rejected or withdrawn', async () => {
    const { app, alice, bob, a2, b2, offer } = await setup();
    await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    expect(
      (await post(app, bob.token, `/offers/${offer.id}/respond`, { action: 'accept' })).status,
    ).toBe(422);
    expect(
      (await post(app, bob.token, `/offers/${offer.id}/respond`, { action: 'reject' })).status,
    ).toBe(422);
    expect(
      (await post(app, alice.token, `/offers/${offer.id}/respond`, { action: 'cancel' })).status,
    ).toBe(422);
  });

  it('accepting the counter runs the normal trade: initiator is the counterer, items traded, one transaction', async () => {
    const { app, alice, bob, a2, b2, a1, b1, offer } = await setup();
    const counter = await offerOf(
      await post(app, bob.token, `/offers/${offer.id}/counter`, {
        offeredListingId: b2.id,
        requestedListingId: a2.id,
      }),
    );
    // The counterer cannot accept their own counter; the original sender can.
    expect(
      (await post(app, bob.token, `/offers/${counter.id}/respond`, { action: 'accept' })).status,
    ).toBe(403);
    expect(
      (await post(app, alice.token, `/offers/${counter.id}/respond`, { action: 'accept' })).status,
    ).toBe(200);

    const txs = await ctx.db.select().from(schema.barterTransactions);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      offerId: counter.id,
      initiatedByUserId: bob.user.id,
      counterpartyUserId: alice.user.id,
    });
    const byId = Object.fromEntries(
      (await ctx.db.select().from(schema.listings)).map((l) => [l.id, l.status]),
    );
    expect(byId[b2.id]).toBe('traded');
    expect(byId[a2.id]).toBe('traded');
    // The items from the abandoned first proposal stay on the market.
    expect(byId[a1.id]).toBe('published');
    expect(byId[b1.id]).toBe('published');
  });

  it('rejecting the counter leaves the negotiation closed with a visible history', async () => {
    const { app, alice, bob, a2, b2, offer } = await setup();
    const counter = await offerOf(
      await post(app, bob.token, `/offers/${offer.id}/counter`, {
        offeredListingId: b2.id,
        requestedListingId: a2.id,
      }),
    );
    await post(app, alice.token, `/offers/${counter.id}/respond`, { action: 'reject' });
    const history = (
      await json<Ok<{ items: OfferView[] }>>(
        await get(app, alice.token, `/offers/${counter.id}/history`),
      )
    ).data.items;
    expect(history.map((o) => o.status)).toEqual(['countered', 'rejected']);
  });
});

describe('negotiation chain and history', () => {
  it('lists the whole chain oldest-first from any member, from either party’s point of view', async () => {
    const { app, alice, bob, a1, a2, b1, b2, offer } = await setup();
    const c1 = await offerOf(
      await post(app, bob.token, `/offers/${offer.id}/counter`, {
        offeredListingId: b2.id,
        requestedListingId: a2.id,
      }),
    );
    const c2 = await offerOf(
      await post(app, alice.token, `/offers/${c1.id}/counter`, {
        offeredListingId: a1.id,
        requestedListingId: b2.id,
      }),
    );

    for (const startAt of [offer.id, c1.id, c2.id]) {
      const res = await get(app, bob.token, `/offers/${startAt}/history`);
      const items = (await json<Ok<{ items: OfferView[] }>>(res)).data.items;
      expect(items.map((o) => o.id)).toEqual([offer.id, c1.id, c2.id]);
      expect(items.map((o) => o.status)).toEqual(['countered', 'countered', 'pending']);
      // Perspective is the caller's (Bob): he sent the original's counter, not the original.
      expect(items.map((o) => o.isMine)).toEqual([false, true, false]);
    }
    const asAlice = (
      await json<Ok<{ items: OfferView[] }>>(
        await get(app, alice.token, `/offers/${c2.id}/history`),
      )
    ).data.items;
    expect(asAlice.map((o) => o.isMine)).toEqual([true, false, true]);
    expect(b1.id).toBeTruthy();
  });

  it('is visible to the two parties only', async () => {
    const { app, offer } = await setup();
    const eve = await user(app, 'Eve');
    expect((await get(app, eve.token, `/offers/${offer.id}/history`)).status).toBe(404);
    expect((await app.request(`/api/v1/offers/${offer.id}/history`, {}, testEnv)).status).toBe(401);
  });

  it('a lone offer has a history of one', async () => {
    const { app, alice, offer } = await setup();
    const items = (
      await json<Ok<{ items: OfferView[] }>>(
        await get(app, alice.token, `/offers/${offer.id}/history`),
      )
    ).data.items;
    expect(items).toHaveLength(1);
  });

  it('limits a negotiation to three counters', async () => {
    const { app, alice, bob, a1, a2, b1, b2, offer } = await setup();
    // Counter 1 (Bob), counter 2 (Alice), counter 3 (Bob) — then the cap is reached.
    const c1 = await offerOf(
      await post(app, bob.token, `/offers/${offer.id}/counter`, {
        offeredListingId: b2.id,
        requestedListingId: a2.id,
      }),
    );
    const c2 = await offerOf(
      await post(app, alice.token, `/offers/${c1.id}/counter`, {
        offeredListingId: a1.id,
        requestedListingId: b2.id,
      }),
    );
    const c3 = await offerOf(
      await post(app, bob.token, `/offers/${c2.id}/counter`, {
        offeredListingId: b1.id,
        requestedListingId: a2.id,
      }),
    );
    const fourth = await post(app, alice.token, `/offers/${c3.id}/counter`, {
      offeredListingId: a1.id,
      requestedListingId: b2.id,
    });
    expect(fourth.status).toBe(422);
    expect((await json<{ error: { message: string } }>(fourth)).error.message).toMatch(
      /too many times/i,
    );
    // …but the last offer can still be accepted.
    expect(
      (await post(app, alice.token, `/offers/${c3.id}/respond`, { action: 'accept' })).status,
    ).toBe(200);
  });

  it('the database allows only one counter per offer', async () => {
    const { bob, a1, a2, b1, b2, offer } = await setup();
    const aliceId = (await ctx.db.select().from(schema.offers))[0]!.fromUserId;
    await ctx.db.insert(schema.offers).values({
      id: newId('offer'),
      fromUserId: bob.user.id,
      toUserId: aliceId,
      offeredListingId: b2.id,
      requestedListingId: a2.id,
      parentOfferId: offer.id,
      status: 'pending',
    });
    await expect(
      ctx.db.insert(schema.offers).values({
        id: newId('offer'),
        fromUserId: bob.user.id,
        toUserId: aliceId,
        offeredListingId: b1.id,
        requestedListingId: a1.id,
        parentOfferId: offer.id,
        status: 'pending',
      }),
    ).rejects.toThrow();
  });

  it('shows up in the sender’s and recipient’s lists with the right status filter', async () => {
    const { app, alice, bob, a2, b2, offer } = await setup();
    await post(app, bob.token, `/offers/${offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    const out = (
      await json<Ok<{ items: OfferView[] }>>(
        await get(app, alice.token, '/offers/outgoing?status=countered'),
      )
    ).data.items;
    expect(out.map((o) => o.id)).toEqual([offer.id]);
    const incoming = (
      await json<Ok<{ items: OfferView[] }>>(
        await get(app, alice.token, '/offers/incoming?status=pending'),
      )
    ).data.items;
    expect(incoming).toHaveLength(1);
    expect(incoming[0]!.parentOfferId).toBe(offer.id);
  });
});
