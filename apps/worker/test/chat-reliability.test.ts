/**
 * Milestone 5 — chat reliability: idempotent sends, evidence-based read state,
 * and real unread counts, through the real HTTP routes and a real SQLite engine.
 */
import { newId, schema } from '@pandam/database';
import {
  type AuthSession,
  type ConversationView,
  type MarketItem,
  type MessageView,
} from '@pandam/types';
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
const data = async <T>(r: Response) => (await json<Ok<T>>(r)).data;

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

const api = (app: App, token: string, method: string, path: string, body?: unknown) =>
  app.request(
    `/api/v1${path}`,
    { method, headers: H(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    testEnv,
  );

async function listing(app: App, token: string, title: string): Promise<MarketItem> {
  const r = await api(app, token, 'POST', '/listings', {
    categoryId: catId,
    type: 'service',
    title,
    description: 'A perfectly good thing to trade.',
    status: 'published',
  });
  return (await data<{ item: MarketItem }>(r)).item;
}

/** Alice and Bob with an accepted trade, hence a conversation. */
async function chat() {
  const app = ctx.makeApp();
  const alice = await user(app, 'Alice');
  const bob = await user(app, 'Bobby');
  const a = await listing(app, alice.token, 'Alice thing');
  const b = await listing(app, bob.token, 'Bob thing');
  const offer = await data<{ offer: { id: string } }>(
    await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    }),
  );
  await api(app, bob.token, 'POST', `/offers/${offer.offer.id}/respond`, { action: 'accept' });
  const conv = (await ctx.db.select().from(schema.conversations))[0]!;
  const send = (token: string, body: Record<string, unknown>) =>
    api(app, token, 'POST', `/conversations/${conv.id}/messages`, body);
  const messages = async (token: string) =>
    (
      await data<{ items: MessageView[] }>(
        await api(app, token, 'GET', `/conversations/${conv.id}/messages`),
      )
    ).items;
  const view = async (token: string) =>
    (
      await data<{ conversation: ConversationView }>(
        await api(app, token, 'GET', `/conversations/${conv.id}`),
      )
    ).conversation;
  const read = (token: string) => api(app, token, 'POST', `/conversations/${conv.id}/read`);
  return { app, alice, bob, conv, send, messages, view, read };
}

const notes = async (userId: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === 'message_received',
  );

describe('sending with a client id (idempotent)', () => {
  it('stores a message once however many times the same send is repeated, and notifies once', async () => {
    const { alice, bob, send, messages } = await chat();
    const first = await send(alice.token, { body: 'hello', clientId: 'client-msg-0001' });
    const again = await send(alice.token, { body: 'hello', clientId: 'client-msg-0001' });
    const third = await send(alice.token, { body: 'hello', clientId: 'client-msg-0001' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(third.status).toBe(200);
    const a = await data<{ message: MessageView; replayed: boolean }>(first);
    const b = await data<{ message: MessageView; replayed: boolean }>(again);
    expect(a.replayed).toBe(false);
    expect(b.replayed).toBe(true);
    expect(b.message.id).toBe(a.message.id);
    expect(b.message.clientId).toBe('client-msg-0001');

    expect(await ctx.db.select().from(schema.messages)).toHaveLength(1);
    expect((await messages(bob.token)).map((m) => m.body)).toEqual(['hello']);
    expect(await notes(bob.user.id)).toHaveLength(1);
  });

  it('survives overlapping identical sends (one row, one notification, no server errors)', async () => {
    const { alice, bob, send } = await chat();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        send(alice.token, { body: 'burst', clientId: 'client-burst-01' }),
      ),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(1);
    expect(await notes(bob.user.id)).toHaveLength(1);
  });

  it('different client ids are different messages; messages without one still work', async () => {
    const { alice, send, messages } = await chat();
    await send(alice.token, { body: 'one', clientId: 'client-msg-aaaa' });
    await send(alice.token, { body: 'one', clientId: 'client-msg-bbbb' }); // same text, new intent
    await send(alice.token, { body: 'no id' });
    await send(alice.token, { body: 'no id' });
    expect((await messages(alice.token)).map((m) => m.body)).toEqual([
      'one',
      'one',
      'no id',
      'no id',
    ]);
  });

  it('a client id belongs to its sender: two people can use the same id independently', async () => {
    const { alice, bob, send, messages } = await chat();
    await send(alice.token, { body: 'from alice', clientId: 'shared-client-id' });
    await send(bob.token, { body: 'from bob', clientId: 'shared-client-id' });
    expect((await messages(alice.token)).map((m) => m.body)).toEqual(['from alice', 'from bob']);
  });

  it('refuses to reuse a client id in a different conversation', async () => {
    const { app, alice, bob, send } = await chat();
    await send(alice.token, { body: 'hi', clientId: 'client-msg-0001' });
    // A second conversation for the same user (another trade).
    const carol = await user(app, 'Carol');
    const a2 = await listing(app, alice.token, 'Alice second');
    const c1 = await listing(app, carol.token, 'Carol thing');
    const offer = await data<{ offer: { id: string } }>(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a2.id,
        requestedListingId: c1.id,
      }),
    );
    await api(app, carol.token, 'POST', `/offers/${offer.offer.id}/respond`, { action: 'accept' });
    const other = (await ctx.db.select().from(schema.conversations)).find(
      (c) => c.offerId === offer.offer.id,
    )!;
    const res = await api(app, alice.token, 'POST', `/conversations/${other.id}/messages`, {
      body: 'hi again',
      clientId: 'client-msg-0001',
    });
    expect(res.status).toBe(409);
    void bob;
  });

  it('rejects malformed client ids and still requires text or a photo', async () => {
    const { alice, send } = await chat();
    expect((await send(alice.token, { body: 'x', clientId: 'short' })).status).toBe(422);
    expect((await send(alice.token, { body: 'x', clientId: 'a'.repeat(81) })).status).toBe(422);
    expect((await send(alice.token, { clientId: 'client-msg-0001' })).status).toBe(422);
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(0);
  });

  it('a repeat of an already-stored message still answers "sent" after a block — the sender must learn it went through', async () => {
    const { app, alice, bob, send } = await chat();
    await send(alice.token, { body: 'before the block', clientId: 'client-msg-0001' });
    await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);
    // A brand-new message is refused…
    expect((await send(alice.token, { body: 'after', clientId: 'client-msg-0002' })).status).toBe(
      403,
    );
    // …but the retry of the one that DID go through is reported as sent, not failed.
    const retry = await send(alice.token, {
      body: 'before the block',
      clientId: 'client-msg-0001',
    });
    expect(retry.status).toBe(200);
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(1);
  });

  it('keeps the existing rules: participants only, archived refused, foreign photos refused', async () => {
    const { app, alice, conv, send } = await chat();
    const eve = await user(app, 'Eve');
    expect(
      (
        await api(app, eve.token, 'POST', `/conversations/${conv.id}/messages`, {
          body: 'hi',
          clientId: 'client-msg-0001',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await send(alice.token, {
          body: 'x',
          imageKey: `messages/${eve.user.id}/stolen.jpg`,
          clientId: 'client-msg-0002',
        })
      ).status,
    ).toBe(403);
    await ctx.db
      .update(schema.conversations)
      .set({ status: 'archived' })
      .where(eq(schema.conversations.id, conv.id));
    expect((await send(alice.token, { body: 'late', clientId: 'client-msg-0003' })).status).toBe(
      422,
    );
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(0);
  });
});

describe('read evidence ("seen")', () => {
  it('a message is "seen" only after the other person marks the conversation read', async () => {
    const { alice, bob, send, messages, read } = await chat();
    await send(alice.token, { body: 'first', clientId: 'client-msg-0001' });

    // Stored on the server, but nothing proves anyone saw it.
    let mine = (await messages(alice.token))[0]!;
    expect(mine.readByRecipient).toBe(false);

    // Reading your OWN conversation does not make your message "seen".
    await read(alice.token);
    mine = (await messages(alice.token))[0]!;
    expect(mine.readByRecipient).toBe(false);

    await new Promise((r) => setTimeout(r, 5));
    await read(bob.token);
    mine = (await messages(alice.token))[0]!;
    expect(mine.readByRecipient).toBe(true);
  });

  it('a message sent after the other person last read is not "seen"', async () => {
    const { alice, bob, send, messages, read } = await chat();
    await send(alice.token, { body: 'one', clientId: 'client-msg-0001' });
    await new Promise((r) => setTimeout(r, 5));
    await read(bob.token);
    await new Promise((r) => setTimeout(r, 5));
    await send(alice.token, { body: 'two', clientId: 'client-msg-0002' });
    const seen = (await messages(alice.token)).map((m) => [m.body, m.readByRecipient]);
    expect(seen).toEqual([
      ['one', true],
      ['two', false],
    ]);
  });

  it('only the sender gets read state and retry id; the recipient and strangers learn nothing about them', async () => {
    const { app, alice, bob, send, messages, conv } = await chat();
    await send(alice.token, { body: 'secret-ish', clientId: 'client-msg-0001' });
    const asBob = (await messages(bob.token))[0]!;
    expect(asBob.isMine).toBe(false);
    expect('clientId' in asBob).toBe(false);
    expect('readByRecipient' in asBob).toBe(false);
    const raw = JSON.stringify(
      await data(await api(app, bob.token, 'GET', `/conversations/${conv.id}/messages`)),
    );
    expect(raw).not.toContain('client-msg-0001');
    expect(raw).not.toContain('lastReadAt');
    const eve = await user(app, 'Eve');
    expect((await api(app, eve.token, 'GET', `/conversations/${conv.id}/messages`)).status).toBe(
      404,
    );
  });

  it('the conversation summary carries the same evidence for the last message', async () => {
    const { alice, bob, send, view, read } = await chat();
    await send(alice.token, { body: 'ping', clientId: 'client-msg-0001' });
    expect((await view(alice.token)).lastMessage?.readByRecipient).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await read(bob.token);
    expect((await view(alice.token)).lastMessage?.readByRecipient).toBe(true);
  });
});

describe('unread counts', () => {
  it('counts the other person’s unread messages, never your own, and clears on read', async () => {
    const { alice, bob, send, view, read } = await chat();
    expect(await view(alice.token)).toMatchObject({ unread: false, unreadCount: 0 });

    await send(bob.token, { body: 'one', clientId: 'client-msg-0001' });
    await send(bob.token, { body: 'two', clientId: 'client-msg-0002' });
    await send(alice.token, { body: 'my reply', clientId: 'client-msg-0003' });
    expect(await view(alice.token)).toMatchObject({ unread: true, unreadCount: 2 });
    // Bob's own messages never count as unread for Bob; Alice's reply does.
    expect(await view(bob.token)).toMatchObject({ unread: true, unreadCount: 1 });

    await new Promise((r) => setTimeout(r, 5));
    await read(alice.token);
    expect(await view(alice.token)).toMatchObject({ unread: false, unreadCount: 0 });
    expect((await view(bob.token)).unreadCount).toBe(1); // marking MY read does not clear YOURS

    await new Promise((r) => setTimeout(r, 5));
    await send(bob.token, { body: 'three', clientId: 'client-msg-0004' });
    expect((await view(alice.token)).unreadCount).toBe(1);
  });

  it('shows the same count in the conversation list, and ignores deleted messages', async () => {
    const { app, alice, bob, send } = await chat();
    await send(bob.token, { body: 'keep', clientId: 'client-msg-0001' });
    const gone = await data<{ message: MessageView }>(
      await send(bob.token, { body: 'removed', clientId: 'client-msg-0002' }),
    );
    await ctx.db
      .update(schema.messages)
      .set({ deletedAt: Date.now() })
      .where(eq(schema.messages.id, gone.message.id));
    const list = await data<{ items: ConversationView[] }>(
      await api(app, alice.token, 'GET', '/conversations'),
    );
    expect(list.items[0]).toMatchObject({ unread: true, unreadCount: 1 });
  });
});

describe('ordering', () => {
  it('returns messages oldest-first, in send order, even when sent in quick succession', async () => {
    const { alice, bob, send, messages } = await chat();
    for (let i = 1; i <= 6; i += 1) {
      await send(i % 2 ? alice.token : bob.token, {
        body: `m${i}`,
        clientId: `client-order-${i}0000`,
      });
    }
    expect((await messages(alice.token)).map((m) => m.body)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
    ]);
  });
});
