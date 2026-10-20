/**
 * End-to-end coverage of the barter journey this phase adds: offer -> accept
 * -> transaction + conversation -> messages -> complete -> review. Each step
 * is exercised through the real HTTP routes (no direct repo calls) so
 * authorization and status-transition guards are covered exactly as a client
 * would hit them.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
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

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string } };
const json = <T>(r: Response) => r.json() as Promise<T>;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newUser(app: ReturnType<TestDb['makeApp']>, name: string): Promise<AuthSession> {
  const res = await app.request(
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
  return (await json<Ok<AuthSession>>(res)).data;
}

async function createListing(
  app: ReturnType<TestDb['makeApp']>,
  token: string,
  title: string,
): Promise<MarketItem> {
  const res = await app.request(
    '/api/v1/listings',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
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
  return (await json<Ok<{ item: MarketItem }>>(res)).data.item;
}

describe('offer -> transaction -> review journey', () => {
  it('runs the whole barter lifecycle end to end', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');

    const aliceHas = await createListing(app, alice.token, 'Logo design');
    const bobHas = await createListing(app, bob.token, 'Copywriting');

    // --- Alice offers her logo design for Bob's copywriting ---------------
    const offerRes = await app.request(
      '/api/v1/offers',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(alice.token) },
        body: JSON.stringify({
          toUserId: bob.user.id,
          offeredListingId: aliceHas.id,
          requestedListingId: bobHas.id,
          message: 'Fancy a swap?',
        }),
      },
      testEnv,
    );
    expect(offerRes.status).toBe(201);
    const offer = (
      await json<Ok<{ offer: { id: string; status: string; isMine: boolean } }>>(offerRes)
    ).data.offer;
    expect(offer.status).toBe('pending');
    expect(offer.isMine).toBe(true);

    // Bob cannot accept his own... wait, Alice cannot accept her own offer.
    const selfAccept = await app.request(
      `/api/v1/offers/${offer.id}/respond`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(alice.token) },
        body: JSON.stringify({ action: 'accept' }),
      },
      testEnv,
    );
    expect(selfAccept.status).toBe(403);

    // --- Bob accepts ---------------------------------------------------
    const acceptRes = await app.request(
      `/api/v1/offers/${offer.id}/respond`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({ action: 'accept' }),
      },
      testEnv,
    );
    expect(acceptRes.status).toBe(200);
    const accepted = (await json<Ok<{ offer: { status: string } }>>(acceptRes)).data.offer;
    expect(accepted.status).toBe('accepted');

    // Both listings realised the trade — no longer published.
    const aliceListing = await json<Ok<{ item: MarketItem }>>(
      await app.request(
        `/api/v1/listings/${aliceHas.id}`,
        { headers: bearer(alice.token) },
        testEnv,
      ),
    );
    expect(aliceListing.data.item.status).toBe('traded');

    // --- A conversation exists and both parties can message ------------
    const convosForBob = await json<Ok<{ items: { id: string }[] }>>(
      await app.request('/api/v1/conversations', { headers: bearer(bob.token) }, testEnv),
    );
    expect(convosForBob.data.items).toHaveLength(1);
    const conversationId = convosForBob.data.items[0]!.id;

    const msgRes = await app.request(
      `/api/v1/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({ body: "Let's do it!" }),
      },
      testEnv,
    );
    expect(msgRes.status).toBe(201);

    // A third party cannot see or post into this conversation.
    const eve = await newUser(app, 'Eve');
    const eveRead = await app.request(
      `/api/v1/conversations/${conversationId}`,
      { headers: bearer(eve.token) },
      testEnv,
    );
    expect(eveRead.status).toBe(404);

    // --- The transaction exists and progresses -------------------------
    const txForAlice = await json<Ok<{ items: { id: string; status: string; offerId: string }[] }>>(
      await app.request('/api/v1/transactions', { headers: bearer(alice.token) }, testEnv),
    );
    expect(txForAlice.data.items).toHaveLength(1);
    const tx = txForAlice.data.items[0]!;
    // A trade is born in progress — there is no separate "start" step.
    expect(tx.status).toBe('in_progress');
    expect(tx.offerId).toBe(offer.id);

    const act = (token: string, action: string) =>
      app.request(
        `/api/v1/transactions/${tx.id}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...bearer(token) },
          body: JSON.stringify({ action }),
        },
        testEnv,
      );

    // One party's confirmation (even via the legacy "complete") never completes the trade.
    const first = await act(bob.token, 'complete');
    expect(first.status).toBe(200);
    const afterFirst = (
      await json<
        Ok<{
          transaction: { status: string; confirmedByMe: boolean; confirmedByCounterparty: boolean };
        }>
      >(first)
    ).data.transaction;
    expect(afterFirst).toMatchObject({
      status: 'in_progress',
      confirmedByMe: true,
      confirmedByCounterparty: false,
    });

    // A review before completion is refused.
    const early = await app.request(
      '/api/v1/reviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({ transactionId: tx.id, rating: 5 }),
      },
      testEnv,
    );
    expect(early.status).toBe(422);

    // The second party's confirmation completes it.
    const completeRes = await act(alice.token, 'confirm');
    expect(completeRes.status).toBe(200);
    expect(
      (await json<Ok<{ transaction: { status: string } }>>(completeRes)).data.transaction.status,
    ).toBe('completed');

    // --- Reviews ---------------------------------------------------------
    const reviewRes = await app.request(
      '/api/v1/reviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({ transactionId: tx.id, rating: 5, comment: 'Great trade!' }),
      },
      testEnv,
    );
    expect(reviewRes.status).toBe(201);

    // Bob cannot review the same transaction twice.
    const dupeReview = await app.request(
      '/api/v1/reviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({ transactionId: tx.id, rating: 4 }),
      },
      testEnv,
    );
    expect(dupeReview.status).toBe(422);
    expect((await json<Err>(dupeReview)).error.message).toMatch(/already reviewed/i);

    // Alice (the reviewee) shows up with one received review.
    const aliceReviews = await json<Ok<{ items: { rating: number }[] }>>(
      await app.request(`/api/v1/reviews/users/${alice.user.id}`, {}, testEnv),
    );
    expect(aliceReviews.data.items).toHaveLength(1);
    expect(aliceReviews.data.items[0]?.rating).toBe(5);

    // --- Notifications accumulated along the way ------------------------
    const aliceNotifications = await json<Ok<{ items: { type: string }[] }>>(
      await app.request('/api/v1/notifications', { headers: bearer(alice.token) }, testEnv),
    );
    expect(aliceNotifications.data.items.map((n) => n.type)).toEqual(
      expect.arrayContaining(['offer_accepted', 'review_received']),
    );
  });

  it('a sale-only listing cannot be offered or included in a barter', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');

    const aliceHas = await createListing(app, alice.token, 'Logo design');
    const saleRes = await app.request(
      '/api/v1/listings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(bob.token) },
        body: JSON.stringify({
          categoryId: catId,
          type: 'product',
          title: 'A physical widget',
          description: 'Only for sale, not for trade.',
          status: 'published',
          transactionType: 'sale',
          priceAmount: 199900,
        }),
      },
      testEnv,
    );
    const bobsSaleItem = (await json<Ok<{ item: MarketItem }>>(saleRes)).data.item;

    const offerRes = await app.request(
      '/api/v1/offers',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(alice.token) },
        body: JSON.stringify({
          toUserId: bob.user.id,
          offeredListingId: aliceHas.id,
          requestedListingId: bobsSaleItem.id,
        }),
      },
      testEnv,
    );
    expect(offerRes.status).toBe(422);
  });

  it('rejects an offer for a listing you do not own', async () => {
    const app = ctx.makeApp();
    const alice = await newUser(app, 'Alice');
    const bob = await newUser(app, 'Bob');
    const carol = await newUser(app, 'Carol');

    const bobsListing = await createListing(app, bob.token, 'Copywriting');
    const carolsListing = await createListing(app, carol.token, 'Illustration');

    const res = await app.request(
      '/api/v1/offers',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(alice.token) },
        body: JSON.stringify({
          toUserId: bob.user.id,
          offeredListingId: carolsListing.id, // not Alice's
          requestedListingId: bobsListing.id,
        }),
      },
      testEnv,
    );
    expect(res.status).toBe(422);
  });
});
