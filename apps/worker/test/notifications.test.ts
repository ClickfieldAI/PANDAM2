/**
 * Notification system: every notification is written by the backend when a
 * real business operation succeeds; it is private to its recipient, counted
 * accurately, paginated, never duplicated by a retry, and never created when
 * the operation fails.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem, type NotificationView } from '@pandam/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { eventKey } from '../src/services/notify';

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
const data = async <T>(r: Response) => (await json<Ok<T>>(r)).data;

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

async function user(app: App, name: string): Promise<AuthSession> {
  const r = await api(app, null, 'POST', '/auth/register', {
    email: `${name.toLowerCase()}${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a valid pw 12',
    displayName: name,
  });
  return (await json<Ok<AuthSession>>(r)).data;
}

async function item(
  app: App,
  token: string,
  title: string,
  kind: 'listings' | 'needs' = 'listings',
  extra: Record<string, unknown> = {},
): Promise<MarketItem> {
  const r = await api(app, token, 'POST', `/${kind}`, {
    categoryId: catId,
    type: 'service',
    title,
    description: 'A perfectly good thing to trade.',
    status: 'published',
    ...extra,
  });
  expect(r.status, await r.clone().text()).toBe(201);
  return (await data<{ item: MarketItem }>(r)).item;
}

interface Feed {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}
const feed = async (app: App, token: string, qs = '') =>
  data<Feed>(await api(app, token, 'GET', `/notifications${qs}`));
const types = async (app: App, token: string) => (await feed(app, token)).items.map((n) => n.type);

/** Two traders, each with a listing, and a pending offer from Ann to Bob. */
async function trade() {
  const app = ctx.makeApp();
  const ann = await user(app, 'Ann');
  const bob = await user(app, 'Bob');
  const a = await item(app, ann.token, 'Ann logo design');
  const b = await item(app, bob.token, 'Bob copywriting');
  const res = await api(app, ann.token, 'POST', '/offers', {
    offeredListingId: a.id,
    requestedListingId: b.id,
  });
  expect(res.status).toBe(201);
  const offer = (await data<{ offer: { id: string } }>(res)).offer;
  return { app, ann, bob, a, b, offer };
}

/* ---------------------------------------------------------------- events */

describe('offer events notify the right person', () => {
  it('a new offer notifies the recipient only, with readable text and the offer id', async () => {
    const { app, ann, bob, offer } = await trade();
    const f = await feed(app, bob.token);
    expect(f.items).toHaveLength(1);
    expect(f.items[0]).toMatchObject({
      type: 'offer_received',
      data: { offerId: offer.id },
      read: false,
    });
    expect(f.items[0]!.title).toBeTruthy();
    expect(f.items[0]!.body).toBeTruthy();
    expect(f.unreadCount).toBe(1);
    expect(await types(app, ann.token)).toEqual([]);
  });

  it('accept / reject / withdraw / counter each notify the other party', async () => {
    // accept
    let s = await trade();
    await api(s.app, s.bob.token, 'POST', `/offers/${s.offer.id}/respond`, { action: 'accept' });
    expect(await types(s.app, s.ann.token)).toContain('offer_accepted');
    await ctx.close();

    // reject
    ctx = await makeTestDb();
    await ctx.db
      .insert(schema.categories)
      .values([{ id: (catId = newId('category')), name: 'D', slug: 'd' }]);
    s = await trade();
    await api(s.app, s.bob.token, 'POST', `/offers/${s.offer.id}/respond`, { action: 'reject' });
    expect(await types(s.app, s.ann.token)).toContain('offer_rejected');
    await ctx.close();

    // withdraw (by the sender; the recipient is told)
    ctx = await makeTestDb();
    await ctx.db
      .insert(schema.categories)
      .values([{ id: (catId = newId('category')), name: 'D', slug: 'd' }]);
    s = await trade();
    await api(s.app, s.ann.token, 'POST', `/offers/${s.offer.id}/respond`, { action: 'cancel' });
    expect(await types(s.app, s.bob.token)).toContain('offer_cancelled');
    await ctx.close();

    // counter
    ctx = await makeTestDb();
    await ctx.db
      .insert(schema.categories)
      .values([{ id: (catId = newId('category')), name: 'D', slug: 'd' }]);
    s = await trade();
    const a2 = await item(s.app, s.ann.token, 'Ann second service');
    const b2 = await item(s.app, s.bob.token, 'Bob second service');
    const counter = await api(s.app, s.bob.token, 'POST', `/offers/${s.offer.id}/counter`, {
      offeredListingId: b2.id,
      requestedListingId: a2.id,
    });
    expect(counter.status).toBe(201);
    const ann = await feed(s.app, s.ann.token);
    expect(ann.items.map((n) => n.type)).toContain('offer_countered');
  });

  it('creates nothing when the operation fails', async () => {
    const { app, ann, bob, a } = await trade();
    const before = (await feed(app, bob.token)).items.length;
    // Offering a listing you do not own is refused …
    const bad = await api(app, bob.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: a.id,
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    // … and answering someone else's offer is refused.
    const [o] = await ctx.db.select().from(schema.offers);
    const intruder = await user(app, 'Eve');
    const refused = await api(app, intruder.token, 'POST', `/offers/${o!.id}/respond`, {
      action: 'accept',
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect((await feed(app, bob.token)).items).toHaveLength(before);
    expect(await types(app, ann.token)).toEqual([]);
    expect(await types(app, intruder.token)).toEqual([]);
  });
});

describe('chat and trades', () => {
  async function accepted() {
    const s = await trade();
    const res = await api(s.app, s.bob.token, 'POST', `/offers/${s.offer.id}/respond`, {
      action: 'accept',
    });
    const view = (await data<{ offer: { conversationId: string } }>(res)).offer;
    const [tx] = await ctx.db.select().from(schema.barterTransactions);
    return { ...s, conversationId: view.conversationId, tx: tx! };
  }

  it('a chat message notifies the other participant, once, even if the send is retried', async () => {
    const s = await accepted();
    const body = { body: 'Hello there', clientId: 'cid_retry_0001' };
    const first = await api(
      s.app,
      s.ann.token,
      'POST',
      `/conversations/${s.conversationId}/messages`,
      body,
    );
    expect(first.status).toBe(201);
    const again = await api(
      s.app,
      s.ann.token,
      'POST',
      `/conversations/${s.conversationId}/messages`,
      body,
    );
    expect(again.status).toBe(200); // replay
    const msgs = (await feed(s.app, s.bob.token)).items.filter(
      (n) => n.type === 'message_received',
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.data.conversationId).toBe(s.conversationId);
    // The sender is never notified about their own message.
    expect((await types(s.app, s.ann.token)).filter((t) => t === 'message_received')).toHaveLength(
      0,
    );
  });

  it('a trade needs confirmation, then completes — each told exactly once', async () => {
    const s = await accepted();
    await api(s.app, s.ann.token, 'POST', `/transactions/${s.tx.id}/status`, { action: 'confirm' });
    const bobFeed = (await feed(s.app, s.bob.token)).items.filter(
      (n) => n.type === 'transaction_updated',
    );
    expect(bobFeed.map((n) => n.data.status)).toContain('awaiting_confirmation');

    // Re-sending the same confirmation does not notify again.
    await api(s.app, s.ann.token, 'POST', `/transactions/${s.tx.id}/status`, { action: 'confirm' });
    expect(
      (await feed(s.app, s.bob.token)).items.filter(
        (n) => n.data.status === 'awaiting_confirmation',
      ),
    ).toHaveLength(1);

    await api(s.app, s.bob.token, 'POST', `/transactions/${s.tx.id}/status`, { action: 'confirm' });
    for (const who of [s.ann, s.bob]) {
      const done = (await feed(s.app, who.token)).items.filter(
        (n) => n.data.status === 'completed',
      );
      expect(done, who.user.id).toHaveLength(1);
      expect(done[0]!.data.transactionId).toBe(s.tx.id);
    }
  });
});

describe('listing interactions and interest-based alerts', () => {
  it('saving a listing tells its owner once per saver, never the saver, and a failed save tells nobody', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Owner');
    const fan = await user(app, 'Fan');
    const l = await item(app, owner.token, 'Handmade chair');

    expect((await api(app, owner.token, 'PUT', `/favourites/${l.id}`)).status).toBe(422); // own listing
    expect(await types(app, owner.token)).toEqual([]);

    expect((await api(app, fan.token, 'PUT', `/favourites/${l.id}`)).status).toBe(200);
    await api(app, fan.token, 'DELETE', `/favourites/${l.id}`);
    expect((await api(app, fan.token, 'PUT', `/favourites/${l.id}`)).status).toBe(200);
    const saved = (await feed(app, owner.token)).items.filter((n) => n.type === 'listing_saved');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.data.listingId).toBe(l.id);
    expect(JSON.stringify(saved[0])).not.toContain(fan.user.id); // no identity leak
    expect(await types(app, fan.token)).toEqual([]);

    expect((await api(app, fan.token, 'PUT', `/favourites/${newId('listing')}`)).status).toBe(404);
  });

  it('a new listing only alerts people with a matching published request, and honours opt-out', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Seller');
    const wants = await user(app, 'Wants'); // published need, same category + type
    const optedOut = await user(app, 'Quiet'); // matching need, alerts off
    const unrelated = await user(app, 'Other'); // no need at all
    const draftOnly = await user(app, 'Draft'); // matching need that is only a draft

    await item(app, wants.token, 'Need a logo', 'needs');
    await item(app, optedOut.token, 'Also need a logo', 'needs');
    await item(app, draftOnly.token, 'Draft need', 'needs', { status: 'draft' });
    expect(
      (
        await api(app, optedOut.token, 'PUT', '/notifications/preferences', {
          listingAlerts: false,
        })
      ).status,
    ).toBe(200);

    const l = await item(app, seller.token, 'Logo design service');
    expect(
      (await feed(app, wants.token)).items.filter((n) => n.type === 'listing_match'),
    ).toHaveLength(1);
    expect(
      (await feed(app, wants.token)).items.find((n) => n.type === 'listing_match')!.data,
    ).toEqual({
      listingId: l.id,
    });
    for (const quiet of [optedOut, unrelated, draftOnly, seller]) {
      expect(await types(app, quiet.token), quiet.user.id).not.toContain('listing_match');
    }

    // A draft listing alerts nobody until it is published — and only once.
    const draft = await item(app, seller.token, 'Another logo service', 'listings', {
      status: 'draft',
    });
    expect(
      (await feed(app, wants.token)).items.filter((n) => n.type === 'listing_match'),
    ).toHaveLength(1);
    await api(app, seller.token, 'POST', `/listings/${draft.id}/status`, { status: 'published' });
    await api(app, seller.token, 'POST', `/listings/${draft.id}/status`, { status: 'paused' });
    await api(app, seller.token, 'POST', `/listings/${draft.id}/status`, { status: 'published' });
    expect(
      (await feed(app, wants.token)).items.filter((n) => n.type === 'listing_match'),
    ).toHaveLength(2);
  });

  it('does not alert someone blocked either way with the seller', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Seller');
    const wants = await user(app, 'Wants');
    await item(app, wants.token, 'Need a logo', 'needs');
    await api(app, wants.token, 'PUT', `/blocks/${seller.user.id}`);
    await item(app, seller.token, 'Logo design service');
    expect(await types(app, wants.token)).not.toContain('listing_match');
  });
});

/* --------------------------------------------------------- feed, auth */

describe('the feed: counts, read state, pagination, persistence', () => {
  async function many(n: number) {
    const app = ctx.makeApp();
    const bob = await user(app, 'Bob');
    const ann = await user(app, 'Ann');
    const mine = await item(app, bob.token, 'Bob service item');
    for (let i = 0; i < n; i++) {
      await ctx.db.insert(schema.notifications).values({
        id: newId('notification'),
        userId: bob.user.id,
        type: 'offer_received',
        data: JSON.stringify({ offerId: `ofr_${i}` }),
        dedupeKey: `seed-${i}`,
        createdAt: 1_000_000 + i,
      });
    }
    return { app, bob, ann, mine };
  }

  it('counts unread accurately, marks one and all read, and keeps the state across requests', async () => {
    const { app, bob } = await many(5);
    expect(
      (
        await data<{ unreadCount: number }>(
          await api(app, bob.token, 'GET', '/notifications/unread-count'),
        )
      ).unreadCount,
    ).toBe(5);
    const f = await feed(app, bob.token);
    const one = f.items[0]!;
    const r = await data<{ unreadCount: number }>(
      await api(app, bob.token, 'POST', `/notifications/${one.id}/read`),
    );
    expect(r.unreadCount).toBe(4);
    // Idempotent: reading it again changes nothing.
    expect(
      (
        await data<{ unreadCount: number }>(
          await api(app, bob.token, 'POST', `/notifications/${one.id}/read`),
        )
      ).unreadCount,
    ).toBe(4);
    expect((await feed(app, bob.token, '?unread=true')).items).toHaveLength(4);
    expect((await feed(app, bob.token)).items.find((n) => n.id === one.id)!.read).toBe(true);

    const all = await data<{ read: number; unreadCount: number }>(
      await api(app, bob.token, 'POST', '/notifications/read-all'),
    );
    expect(all).toMatchObject({ read: 4, unreadCount: 0 });
    expect((await feed(app, bob.token)).items.every((n) => n.read)).toBe(true);
    expect((await feed(app, bob.token)).items).toHaveLength(5); // still persisted
  });

  it('pages newest-first with a stable cursor and a bounded size', async () => {
    const { app, bob } = await many(7);
    const p1 = await feed(app, bob.token, '?limit=3');
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await feed(app, bob.token, `?limit=3&cursor=${p1.nextCursor}`);
    const p3 = await feed(app, bob.token, `?limit=3&cursor=${p2.nextCursor}`);
    const ids = [...p1.items, ...p2.items, ...p3.items].map((n) => n.id);
    expect(new Set(ids).size).toBe(7);
    expect(p3.items).toHaveLength(1);
    expect(p3.nextCursor).toBeNull();
    const times = [...p1.items, ...p2.items, ...p3.items].map((n) => n.createdAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // A huge limit is clamped, and a garbage cursor is a clean 422.
    expect((await feed(app, bob.token, '?limit=100000')).items.length).toBeLessThanOrEqual(100);
    expect((await api(app, bob.token, 'GET', '/notifications?cursor=garbage')).status).toBe(422);
  });
});

describe('authorization', () => {
  it('requires sign-in on every notification route', async () => {
    const app = ctx.makeApp();
    for (const [m, p] of [
      ['GET', '/notifications'],
      ['GET', '/notifications/unread-count'],
      ['GET', '/notifications/preferences'],
      ['PUT', '/notifications/preferences'],
      ['POST', '/notifications/read-all'],
      ['POST', `/notifications/${newId('notification')}/read`],
    ] as const) {
      expect((await api(app, null, m, p, m === 'GET' ? undefined : {})).status, `${m} ${p}`).toBe(
        401,
      );
    }
  });

  it("nobody can read, count, or mark another person's notifications", async () => {
    const { app, ann, bob } = await trade(); // Bob has one unread
    const [row] = await ctx.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, bob.user.id));

    expect((await feed(app, ann.token)).items).toEqual([]);
    expect((await feed(app, ann.token)).unreadCount).toBe(0);
    const steal = await api(app, ann.token, 'POST', `/notifications/${row!.id}/read`);
    expect(steal.status).toBe(404); // same answer as "does not exist"
    await api(app, ann.token, 'POST', '/notifications/read-all');
    const [after] = await ctx.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, row!.id));
    expect(after!.readAt).toBeNull();
    expect((await feed(app, bob.token)).unreadCount).toBe(1);
  });

  it('keeps push tokens out of every response', async () => {
    const { app, bob } = await trade();
    await api(app, bob.token, 'POST', '/notifications/tokens', {
      token: 'ExponentPushToken[abcdefghijklmnop]',
      platform: 'ios',
    });
    const text = [
      await (await api(app, bob.token, 'GET', '/notifications')).text(),
      await (await api(app, bob.token, 'GET', '/notifications/preferences')).text(),
      await (await api(app, bob.token, 'GET', '/auth/me')).text(),
    ].join('');
    expect(text).not.toContain('ExponentPushToken');
  });
});

describe('preferences and push delivery', () => {
  it('default to everything on; validate input; persist', async () => {
    const app = ctx.makeApp();
    const u = await user(app, 'Pat');
    expect(
      (
        await data<{ preferences: unknown }>(
          await api(app, u.token, 'GET', '/notifications/preferences'),
        )
      ).preferences,
    ).toEqual({
      pushEnabled: true,
      listingAlerts: true,
    });
    expect((await api(app, u.token, 'PUT', '/notifications/preferences', {})).status).toBe(422);
    expect(
      (await api(app, u.token, 'PUT', '/notifications/preferences', { pushEnabled: 'yes' })).status,
    ).toBe(422);
    expect(
      (await api(app, u.token, 'PUT', '/notifications/preferences', { admin: true })).status,
    ).toBe(422);
    await api(app, u.token, 'PUT', '/notifications/preferences', { pushEnabled: false });
    expect(
      (
        await data<{ preferences: unknown }>(
          await api(app, u.token, 'GET', '/notifications/preferences'),
        )
      ).preferences,
    ).toEqual({
      pushEnabled: false,
      listingAlerts: true,
    });
  });

  it('push is sent once per event, and not at all when switched off — the in-app row always exists', async () => {
    const sent: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('exp.host')) {
        sent.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'x' }] }), { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    try {
      const { app, ann, bob, a, b, offer } = await trade();
      await api(app, bob.token, 'POST', '/notifications/tokens', {
        token: 'ExponentPushToken[abcdefghijklmnop]',
        platform: 'ios',
      });
      // Bob is told about a message exactly once even though the send is retried.
      await api(app, bob.token, 'POST', `/offers/${offer.id}/respond`, { action: 'accept' });
      const pushedAfterAccept = sent.length;

      const [conv] = await ctx.db.select().from(schema.conversations);
      const body = { body: 'ping', clientId: 'cid_push_000001' };
      await api(app, ann.token, 'POST', `/conversations/${conv!.id}/messages`, body);
      await api(app, ann.token, 'POST', `/conversations/${conv!.id}/messages`, body);
      expect(sent.length).toBe(pushedAfterAccept + 1);

      await api(app, bob.token, 'PUT', '/notifications/preferences', { pushEnabled: false });
      await api(app, ann.token, 'POST', `/conversations/${conv!.id}/messages`, {
        body: 'quiet',
        clientId: 'cid_push_000002',
      });
      expect(sent.length).toBe(pushedAfterAccept + 1); // no new push
      expect(
        (await feed(app, bob.token)).items.filter((n) => n.type === 'message_received'),
      ).toHaveLength(2); // rows still written
      void a;
      void b;
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('event identity', () => {
  it('is the type plus its related ids, regardless of key order', () => {
    expect(eventKey({ type: 'offer_received', data: { b: '2', a: '1' } })).toBe(
      eventKey({ type: 'offer_received', data: { a: '1', b: '2' } }),
    );
    expect(eventKey({ type: 'offer_received', data: { offerId: 'x' } })).not.toBe(
      eventKey({ type: 'offer_accepted', data: { offerId: 'x' } }),
    );
    expect(eventKey({ type: 'offer_received', dedupeKey: 'custom' })).toBe('custom');
  });

  it('the database refuses a second notification for the same event, but allows the same event for another user', async () => {
    const app = ctx.makeApp();
    const a = await user(app, 'Ann');
    const b = await user(app, 'Bob');
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    const input = { type: 'offer_received' as const, dedupeKey: 'k1', data: { offerId: 'o1' } };
    expect(await repos.notifications.create({ userId: a.user.id, ...input })).not.toBeNull();
    expect(await repos.notifications.create({ userId: a.user.id, ...input })).toBeNull();
    expect(await repos.notifications.create({ userId: b.user.id, ...input })).not.toBeNull();
  });
});
