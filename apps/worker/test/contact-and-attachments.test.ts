/**
 * Post-acceptance contact (Message / Call / WhatsApp), the mandatory mobile number, and chat
 * attachments (photo, video, location), through the real HTTP routes and a real SQLite engine.
 *
 * Fixed fact this file leans on: a conversation does not exist until the recipient accepts the
 * offer, so "message only before acceptance" is guaranteed by there being no chat at all.
 */
import { newId, schema } from '@pandam/database';
import {
  type AuthSession,
  type ContactView,
  type ConversationView,
  type MarketItem,
  type MessageView,
} from '@pandam/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { signedMediaUrl, verifyMediaSignature } from '../src/lib/signedMedia';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';
import { makeFakeBucket, type FakeBucket } from './helpers/r2';

let ctx: TestDb;
let bucket: FakeBucket;
let env: Record<string, unknown>;
let catId = '';

const ALICE_PHONE = '+919811111111';
const BOB_PHONE = '+919822222222';

beforeEach(async () => {
  // No automatic phone: these tests are about phones, so each user gets exactly what they supply.
  ctx = await makeTestDb({ seedPhones: false });
  bucket = makeFakeBucket();
  env = { ...testEnv, MEDIA: bucket.bucket };
  catId = newId('category');
  await ctx.db.insert(schema.categories).values([{ id: catId, name: 'Design', slug: 'design' }]);
});
afterEach(() => ctx.close());

type App = ReturnType<TestDb['makeApp']>;
type Ok<T> = { ok: true; data: T };
const json = <T>(r: Response) => r.json() as Promise<T>;
const data = async <T>(r: Response) => (await json<Ok<T>>(r)).data;
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
    env,
  );
  return (await json<Ok<AuthSession>>(r)).data;
}

const api = (app: App, token: string, method: string, path: string, body?: unknown) =>
  app.request(
    `/api/v1${path}`,
    { method, headers: H(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    env,
  );

const listingBody = (title: string, extra: Record<string, unknown> = {}) => ({
  categoryId: catId,
  type: 'service',
  title,
  description: 'A perfectly good thing to trade.',
  status: 'published',
  ...extra,
});

async function listing(app: App, token: string, title: string, phone?: string) {
  const r = await api(app, token, 'POST', '/listings', listingBody(title, phone ? { phone } : {}));
  expect(r.status, await r.clone().text()).toBe(201);
  return (await data<{ item: MarketItem }>(r)).item;
}

/** Alice and Bob, each with a saved number and one listing; an offer from Alice to Bob. */
async function trade() {
  const app = ctx.makeApp();
  const alice = await user(app, 'Alice');
  const bob = await user(app, 'Bobby');
  const a = await listing(app, alice.token, 'Alice thing', ALICE_PHONE);
  const b = await listing(app, bob.token, 'Bob thing', BOB_PHONE);
  const offer = (
    await data<{ offer: { id: string } }>(
      await api(app, alice.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    )
  ).offer;
  const respond = (action: 'accept' | 'reject') =>
    api(app, bob.token, 'POST', `/offers/${offer.id}/respond`, { action });
  const conversation = async () => (await ctx.db.select().from(schema.conversations))[0];
  const view = async (token: string, id: string) =>
    (
      await data<{ conversation: ConversationView }>(
        await api(app, token, 'GET', `/conversations/${id}`),
      )
    ).conversation;
  return { app, alice, bob, a, b, offer, respond, conversation, view };
}

async function acceptedTrade() {
  const t = await trade();
  expect((await t.respond('accept')).status).toBe(200);
  const conv = (await t.conversation())!;
  const send = (token: string, body: Record<string, unknown>) =>
    api(t.app, token, 'POST', `/conversations/${conv.id}/messages`, body);
  const messages = async (token: string) =>
    (
      await data<{ items: MessageView[] }>(
        await api(t.app, token, 'GET', `/conversations/${conv.id}/messages`),
      )
    ).items;
  const contact = (token: string) => api(t.app, token, 'GET', `/conversations/${conv.id}/contact`);
  const transactionId = (await ctx.db.select().from(schema.barterTransactions))[0]!.id;
  return { ...t, conv, send, messages, contact, transactionId };
}

/** Bytes that start like a real MP4 / JPEG / text file. */
const mp4 = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // ....ftypisom
  return b;
};
const jpeg = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};
const form = (bytes: Uint8Array, name: string, type: string) => {
  const f = new FormData();
  f.append('file', new File([bytes], name, { type }));
  return f;
};
const upload = (
  app: App,
  token: string,
  convId: string,
  kind: 'attachments' | 'attachments/video',
  body: FormData,
) =>
  app.request(
    `/api/v1/conversations/${convId}/${kind}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
    env,
  );

describe('mandatory mobile number on listings and requests', () => {
  it('refuses a listing when no number is supplied and none is saved', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const r = await api(app, alice.token, 'POST', '/listings', listingBody('No number'));
    expect(r.status).toBe(422);
    const body = await json<{ error: { code: string; details?: Record<string, string[]> } }>(r);
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details?.phone).toBeTruthy();
    expect(await ctx.db.select().from(schema.listings)).toHaveLength(0);
  });

  it('refuses a request (need) the same way', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const r = await api(app, alice.token, 'POST', '/needs', {
      categoryId: catId,
      type: 'service',
      title: 'Need a logo',
      description: 'A simple logo for a small shop.',
    });
    expect(r.status).toBe(422);
    expect(await ctx.db.select().from(schema.needs)).toHaveLength(0);
  });

  it('refuses malformed numbers on the server (client-side checks are not enough)', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    for (const phone of ['12345', 'abcdefghij', '9876543210', '+0000000000', '+91 98765 4321x']) {
      const r = await api(app, alice.token, 'POST', '/listings', listingBody('Bad', { phone }));
      expect(r.status, phone).toBe(422);
    }
    expect(await ctx.db.select().from(schema.listings)).toHaveLength(0);
  });

  it('accepts a formatted number, stores it normalised, and reuses it for later posts', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    await listing(app, alice.token, 'First', '+91 98111-11111');
    const saved = await data<{ phone: string | null }>(
      await api(app, alice.token, 'GET', '/profiles/me/phone'),
    );
    expect(saved.phone).toBe(ALICE_PHONE);

    // No number this time: the saved one is used.
    const second = await api(app, alice.token, 'POST', '/listings', listingBody('Second'));
    expect(second.status).toBe(201);
    const need = await api(app, alice.token, 'POST', '/needs', {
      categoryId: catId,
      type: 'service',
      title: 'Need a logo',
      description: 'A simple logo for a small shop.',
    });
    expect(need.status).toBe(201);

    // A newly supplied number replaces the saved one.
    await listing(app, alice.token, 'Third', '+44 20 7946 0958');
    expect(
      (
        await data<{ phone: string | null }>(
          await api(app, alice.token, 'GET', '/profiles/me/phone'),
        )
      ).phone,
    ).toBe('+442079460958');
  });

  it('lets a person set their number directly, and validates it', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    expect((await api(app, alice.token, 'PUT', '/profiles/me/phone', { phone: 'x' })).status).toBe(
      422,
    );
    const ok = await api(app, alice.token, 'PUT', '/profiles/me/phone', {
      phone: '+91 98111 11111',
    });
    expect(ok.status).toBe(200);
    expect((await data<{ phone: string }>(ok)).phone).toBe(ALICE_PHONE);
    expect((await api(app, '', 'GET', '/profiles/me/phone')).status).toBe(401);
  });

  it('never puts a number in a listing, discovery, profile or auth response', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const item = await listing(app, alice.token, 'Alice thing', ALICE_PHONE);
    const digits = ALICE_PHONE.slice(1);

    const texts = await Promise.all(
      [
        api(app, bob.token, 'GET', `/listings/${item.id}`),
        api(app, bob.token, 'GET', '/listings'),
        api(app, bob.token, 'GET', `/listings?owner=${alice.user.id}`),
        api(app, alice.token, 'GET', '/listings/mine'),
        api(app, alice.token, 'GET', '/profiles/me'),
        api(app, alice.token, 'GET', '/auth/me'),
        api(app, bob.token, 'GET', '/matches'),
      ].map(async (p) => (await p).text()),
    );
    for (const t of texts) {
      expect(t).not.toContain(digits);
      expect(t.toLowerCase()).not.toContain('phone');
    }
  });
});

describe('Message / Call / WhatsApp availability', () => {
  it('before acceptance there is no chat and no contact: a pending offer opens nothing', async () => {
    const { app, alice, bob, offer, conversation } = await trade();
    expect(await conversation()).toBeUndefined();
    const view = await data<{ offer: { conversationId: string | null } }>(
      await api(app, alice.token, 'GET', `/offers/${offer.id}`),
    );
    expect(view.offer.conversationId).toBeNull();
    // Neither side has any conversation to message in, or to ask for a number from.
    for (const t of [alice.token, bob.token]) {
      const list = await data<{ items: unknown[] }>(await api(app, t, 'GET', '/conversations'));
      expect(list.items).toEqual([]);
    }
  });

  it('after acceptance both people can message, call and WhatsApp each other', async () => {
    const { alice, bob, conv, view, contact, send } = await acceptedTrade();
    expect((await view(alice.token, conv.id)).canContact).toBe(true);
    expect((await view(bob.token, conv.id)).canContact).toBe(true);

    // Each gets the OTHER person's number — never their own, never a third party's.
    expect((await data<ContactView>(await contact(alice.token))).phone).toBe(BOB_PHONE);
    expect((await data<ContactView>(await contact(bob.token))).phone).toBe(ALICE_PHONE);
    expect((await send(alice.token, { body: 'hello' })).status).toBe(201);
  });

  it('the list of conversations carries the flag too', async () => {
    const { app, alice } = await acceptedTrade();
    const list = await data<{ items: ConversationView[] }>(
      await api(app, alice.token, 'GET', '/conversations'),
    );
    expect(list.items[0]?.canContact).toBe(true);
  });

  it('a person who has not saved a number is reachable by message, with phone: null', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await listing(app, alice.token, 'Alice thing', ALICE_PHONE);
    const b = await listing(app, bob.token, 'Bob thing', BOB_PHONE);
    // Bob's number is later cleared (e.g. an old account).
    await ctx.db.update(schema.profiles).set({ phoneE164: null });
    const offer = (
      await data<{ offer: { id: string } }>(
        await api(app, alice.token, 'POST', '/offers', {
          offeredListingId: a.id,
          requestedListingId: b.id,
        }),
      )
    ).offer;
    await api(app, bob.token, 'POST', `/offers/${offer.id}/respond`, { action: 'accept' });
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const r = await api(app, alice.token, 'GET', `/conversations/${conv.id}/contact`);
    expect(r.status).toBe(200);
    expect((await data<ContactView>(r)).phone).toBeNull();
  });

  it('a stranger cannot read the contact of someone else’s trade (404, like any other chat read)', async () => {
    const { app, conv } = await acceptedTrade();
    const carol = await user(app, 'Carol');
    const r = await api(app, carol.token, 'GET', `/conversations/${conv.id}/contact`);
    expect(r.status).toBe(404);
    const leaked = await r.text();
    expect(leaked).not.toContain(ALICE_PHONE.slice(1));
    expect(leaked).not.toContain(BOB_PHONE.slice(1));
    expect((await api(app, '', 'GET', `/conversations/${conv.id}/contact`)).status).toBe(401);
  });

  it('a rejected offer never opens a chat or contact', async () => {
    const { app, alice, respond, conversation } = await trade();
    expect((await respond('reject')).status).toBe(200);
    expect(await conversation()).toBeUndefined();
    const list = await data<{ items: unknown[] }>(
      await api(app, alice.token, 'GET', '/conversations'),
    );
    expect(list.items).toEqual([]);
  });

  it('a cancelled offer (withdrawn by the sender) never opens a chat or contact', async () => {
    const { app, alice, offer, conversation } = await trade();
    expect(
      (await api(app, alice.token, 'POST', `/offers/${offer.id}/respond`, { action: 'cancel' }))
        .status,
    ).toBe(200);
    expect(await conversation()).toBeUndefined();
  });

  it('cancelling the trade withdraws Call and WhatsApp straight away, for both people', async () => {
    const { app, alice, bob, conv, view, contact, transactionId } = await acceptedTrade();
    expect((await contact(alice.token)).status).toBe(200);
    const cancel = await api(app, alice.token, 'POST', `/transactions/${transactionId}/status`, {
      action: 'cancel',
    });
    expect(cancel.status, await cancel.clone().text()).toBe(200);

    for (const t of [alice.token, bob.token]) {
      expect((await view(t, conv.id)).canContact).toBe(false);
      const r = await contact(t);
      expect(r.status).toBe(403);
      expect(await r.text()).not.toMatch(/\+?91982/);
    }
  });

  it('a completed trade no longer grants contact details either', async () => {
    const { app, alice, bob, conv, contact, transactionId } = await acceptedTrade();
    for (const t of [alice.token, bob.token]) {
      const r = await api(app, t, 'POST', `/transactions/${transactionId}/status`, {
        action: 'complete',
      });
      expect(r.status, await r.clone().text()).toBe(200);
    }
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    expect(tx.status).toBe('completed');
    expect((await contact(alice.token)).status).toBe(403);
    expect((await contact(bob.token)).status).toBe(403);
    void conv;
  });

  it('a block, from either side, removes contact without needing the UI to cooperate', async () => {
    const { app, alice, bob, conv, view, contact } = await acceptedTrade();
    const block = await api(app, bob.token, 'PUT', `/blocks/${alice.user.id}`);
    expect(block.status, await block.clone().text()).toBeLessThan(300);
    expect((await contact(alice.token)).status).toBe(403);
    expect((await contact(bob.token)).status).toBe(403);
    expect((await view(alice.token, conv.id)).canContact).toBe(false);
  });

  it('an archived conversation grants nothing', async () => {
    const { alice, conv, contact } = await acceptedTrade();
    await ctx.db.update(schema.conversations).set({ status: 'archived' });
    expect((await contact(alice.token)).status).toBe(403);
    void conv;
  });

  it('accepting one trade does not reveal numbers from any other', async () => {
    const { app, alice, bob, conv } = await acceptedTrade();
    const carol = await user(app, 'Carol');
    const c1 = await listing(app, carol.token, 'Carol thing', '+919833333333');
    const a2 = await listing(app, alice.token, 'Alice second thing');
    // Carol offers to Alice; it stays pending.
    await api(app, carol.token, 'POST', '/offers', {
      offeredListingId: c1.id,
      requestedListingId: a2.id,
    });
    const aliceConvs = await data<{ items: ConversationView[] }>(
      await api(app, alice.token, 'GET', '/conversations'),
    );
    expect(aliceConvs.items).toHaveLength(1); // only Bob's
    // Alice can read Bob's number for Bob's trade — and nothing about Carol's anywhere.
    const r = await api(app, alice.token, 'GET', `/conversations/${conv.id}/contact`);
    expect(await r.text()).not.toContain('9833333333');
    void bob;
  });
});

describe('chat attachments: private media', () => {
  it('a photo is stored under the sender’s prefix and its URL is signed', async () => {
    const { app, alice, bob, conv, send, messages } = await acceptedTrade();
    const up = await upload(
      app,
      alice.token,
      conv.id,
      'attachments',
      form(jpeg(), 'p.jpg', 'image/jpeg'),
    );
    expect(up.status).toBe(201);
    const { imageKey, imageUrl } = await data<{ imageKey: string; imageUrl: string }>(up);
    expect(imageKey.startsWith(`messages/${alice.user.id}/`)).toBe(true);
    expect(imageUrl).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);

    expect((await send(alice.token, { imageKey })).status).toBe(201);
    const seen = (await messages(bob.token))[0]!;
    expect(seen.imageUrl).toMatch(/sig=/);
    expect(seen.videoUrl).toBeNull();
    expect(seen.location).toBeNull();

    // The signed URL works …
    expect((await app.request(seen.imageUrl!, {}, env)).status).toBe(200);
  });

  it('the same object is unreachable without the signature, with a wrong one, or once expired', async () => {
    const { app, alice, conv, send, messages } = await acceptedTrade();
    const up = await upload(
      app,
      alice.token,
      conv.id,
      'attachments',
      form(jpeg(), 'p.jpg', 'image/jpeg'),
    );
    const { imageKey } = await data<{ imageKey: string }>(up);
    await send(alice.token, { imageKey });
    const url = (await messages(alice.token))[0]!.imageUrl!;
    const bare = url.split('?')[0]!;
    const sig = /sig=([0-9a-f]{64})/.exec(url)![1]!;
    const exp = /exp=(\d+)/.exec(url)![1]!;

    expect((await app.request(bare, {}, env)).status).toBe(404);
    expect((await app.request(`${bare}?exp=${exp}&sig=${'0'.repeat(64)}`, {}, env)).status).toBe(
      404,
    );
    expect(
      (await app.request(`${bare}?exp=${Number(exp) + 3_600_000}&sig=${sig}`, {}, env)).status,
    ).toBe(404);
    expect((await app.request(`${bare}?sig=${sig}`, {}, env)).status).toBe(404);
    // A signature for one object does not open another.
    const other = bare.replace(/[^/]+$/, 'other.jpg');
    expect((await app.request(`${other}?exp=${exp}&sig=${sig}`, {}, env)).status).toBe(404);
    // An authenticated user without a signature gets nothing either: possession of a session is not access.
    const carol = await user(app, 'Carol');
    expect((await app.request(bare, { headers: H(carol.token) }, env)).status).toBe(404);
  });

  it('signed URLs expire and are stable within the hour (so polling does not refetch images)', async () => {
    const e = { PANDAM_ENV: 'development' as const };
    const now = Date.UTC(2026, 0, 1, 10, 20, 0);
    const a = await signedMediaUrl(e, 'messages/u/x.jpg', now);
    const b = await signedMediaUrl(e, 'messages/u/x.jpg', now + 30 * 60_000 - 1);
    expect(a).toBe(b);
    const [, exp, sig] = /exp=(\d+)&sig=([0-9a-f]+)/.exec(a)!;
    expect(await verifyMediaSignature(e, 'messages/u/x.jpg', exp, sig, now)).toBe(true);
    expect(await verifyMediaSignature(e, 'messages/u/x.jpg', exp, sig, Number(exp) + 1)).toBe(
      false,
    );
  });

  it('refuses to sign without a secret outside development', async () => {
    await expect(signedMediaUrl({ PANDAM_ENV: 'production' }, 'messages/u/x.jpg')).rejects.toThrow(
      /MEDIA_URL_SECRET/,
    );
    await expect(
      signedMediaUrl(
        { PANDAM_ENV: 'production', MEDIA_URL_SECRET: 'a-real-secret' },
        'messages/u/x.jpg',
      ),
    ).resolves.toMatch(/sig=/);
  });

  it('listing photos and avatars stay public (no signature needed)', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const item = await listing(app, alice.token, 'Alice thing', ALICE_PHONE);
    const up = await app.request(
      `/api/v1/listings/${item.id}/images`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${alice.token}` },
        body: form(jpeg(), 'p.jpg', 'image/jpeg'),
      },
      env,
    );
    expect(up.status).toBe(201);
    const key = bucket.keys().find((k) => k.startsWith('listings/'))!;
    expect((await app.request(`/api/v1/media/${key}`, {}, env)).status).toBe(200);
  });
});

describe('chat attachments: video', () => {
  it('uploads a real MP4, sends it with a thumbnail, and both people can play it', async () => {
    const { app, alice, bob, conv, send, messages } = await acceptedTrade();
    const thumb = await data<{ imageKey: string }>(
      await upload(app, alice.token, conv.id, 'attachments', form(jpeg(), 't.jpg', 'image/jpeg')),
    );
    const up = await upload(
      app,
      alice.token,
      conv.id,
      'attachments/video',
      form(mp4(), 'clip.mp4', 'video/mp4'),
    );
    expect(up.status, await up.clone().text()).toBe(201);
    const { videoKey, videoUrl } = await data<{ videoKey: string; videoUrl: string }>(up);
    expect(videoKey).toMatch(new RegExp(`^messages/${alice.user.id}/.+\\.mp4$`));
    expect(videoUrl).toMatch(/sig=/);

    const sent = await send(alice.token, { videoKey, imageKey: thumb.imageKey });
    expect(sent.status).toBe(201);
    const seen = (await messages(bob.token))[0]!;
    expect(seen.videoUrl).toMatch(/sig=/);
    expect(seen.imageUrl).toMatch(/sig=/); // the thumbnail
    expect(seen.body).toBe('');
    const res = await app.request(seen.videoUrl!, {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toMatch(/private/);
    expect((await app.request(seen.videoUrl!.split('?')[0]!, {}, env)).status).toBe(404);
  });

  it('accepts QuickTime and WebM too', async () => {
    const { app, alice, conv } = await acceptedTrade();
    const mov = mp4();
    mov.set([0x71, 0x74, 0x20, 0x20], 8); // brand "qt  "
    const webm = new Uint8Array(32);
    webm.set([0x1a, 0x45, 0xdf, 0xa3]);
    for (const [bytes, name, type] of [
      [mov, 'a.mov', 'video/quicktime'],
      [webm, 'a.webm', 'video/webm'],
    ] as const) {
      const r = await upload(
        app,
        alice.token,
        conv.id,
        'attachments/video',
        form(bytes, name, type),
      );
      expect(r.status, name).toBe(201);
    }
  });

  it('refuses anything that is not a video, whatever it is called', async () => {
    const { app, alice, conv } = await acceptedTrade();
    const text = new TextEncoder().encode('<html>not a video</html>');
    for (const [bytes, name, type] of [
      [text, 'clip.mp4', 'video/mp4'],
      [jpeg(), 'clip.mp4', 'video/mp4'], // a photo renamed
      [new Uint8Array(0), 'empty.mp4', 'video/mp4'],
    ] as const) {
      const r = await upload(
        app,
        alice.token,
        conv.id,
        'attachments/video',
        form(bytes, name, type),
      );
      expect(r.status, name).toBe(422);
    }
    expect(bucket.keys().filter((k) => k.endsWith('.mp4'))).toHaveLength(0);
  });

  it('refuses a HEIC photo posing as a video, and a video posing as a photo', async () => {
    const { app, alice, conv } = await acceptedTrade();
    const heic = new Uint8Array(32);
    heic.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(
      (
        await upload(
          app,
          alice.token,
          conv.id,
          'attachments/video',
          form(heic, 'x.mov', 'video/quicktime'),
        )
      ).status,
    ).toBe(422);
    expect(
      (await upload(app, alice.token, conv.id, 'attachments', form(mp4(), 'x.jpg', 'image/jpeg')))
        .status,
    ).toBe(422);
  });

  it('enforces the 40 MB limit before storing anything', async () => {
    const { app, alice, conv } = await acceptedTrade();
    const big = mp4(40 * 1024 * 1024 + 1);
    const r = await upload(
      app,
      alice.token,
      conv.id,
      'attachments/video',
      form(big, 'big.mp4', 'video/mp4'),
    );
    expect(r.status).toBe(422);
    expect(await r.text()).toMatch(/40 MB/);
    expect(bucket.keys()).toHaveLength(0);
  });

  it('only a participant may upload, and only for their own message', async () => {
    const { app, alice, bob, conv, send } = await acceptedTrade();
    const carol = await user(app, 'Carol');
    const r = await upload(
      app,
      carol.token,
      conv.id,
      'attachments/video',
      form(mp4(), 'c.mp4', 'video/mp4'),
    );
    expect(r.status).toBe(404);
    expect(
      (await upload(app, '', conv.id, 'attachments/video', form(mp4(), 'c.mp4', 'video/mp4')))
        .status,
    ).toBe(401);

    // Bob cannot send a message that points at Alice's upload.
    const up = await data<{ videoKey: string }>(
      await upload(
        app,
        alice.token,
        conv.id,
        'attachments/video',
        form(mp4(), 'a.mp4', 'video/mp4'),
      ),
    );
    expect((await send(bob.token, { videoKey: up.videoKey })).status).toBe(403);
    expect((await send(alice.token, { videoKey: up.videoKey })).status).toBe(201);
  });

  it('an archived conversation accepts no new uploads', async () => {
    const { app, alice, conv } = await acceptedTrade();
    await ctx.db.update(schema.conversations).set({ status: 'archived' });
    const r = await upload(
      app,
      alice.token,
      conv.id,
      'attachments/video',
      form(mp4(), 'a.mp4', 'video/mp4'),
    );
    expect(r.status).toBe(422);
  });
});

describe('chat attachments: location', () => {
  const place = { latitude: 12.9716, longitude: 77.5946, placeName: 'Cubbon Park, Bengaluru' };

  it('shares a location with a place name, and the other person receives it', async () => {
    const { alice, bob, send, messages } = await acceptedTrade();
    const r = await send(alice.token, { location: place });
    expect(r.status, await r.clone().text()).toBe(201);
    const seen = (await messages(bob.token))[0]!;
    expect(seen.location).toEqual(place);
    expect(seen.imageUrl).toBeNull();
    expect(seen.videoUrl).toBeNull();
    expect(seen.body).toBe('');
    expect((await messages(alice.token))[0]!.isMine).toBe(true);
  });

  it('place name is optional, and a caption may ride along', async () => {
    const { alice, bob, send, messages } = await acceptedTrade();
    await send(alice.token, { location: { latitude: 1.5, longitude: -2.5 }, body: 'Meet here' });
    const seen = (await messages(bob.token))[0]!;
    expect(seen.location).toEqual({ latitude: 1.5, longitude: -2.5, placeName: null });
    expect(seen.body).toBe('Meet here');
  });

  it('rejects impossible coordinates and location-plus-media', async () => {
    const { alice, send } = await acceptedTrade();
    for (const location of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: 'x', longitude: 0 },
      { latitude: 0 },
    ]) {
      expect((await send(alice.token, { location })).status).toBe(422);
    }
    expect(
      (await send(alice.token, { location: place, imageKey: `messages/${alice.user.id}/a.jpg` }))
        .status,
    ).toBe(422);
  });

  it('is only available to people in the conversation', async () => {
    const { app, conv } = await acceptedTrade();
    const carol = await user(app, 'Carol');
    const r = await api(app, carol.token, 'POST', `/conversations/${conv.id}/messages`, {
      location: place,
    });
    expect(r.status).toBe(404);
    expect((await ctx.db.select().from(schema.messages)).length).toBe(0);
  });

  it('a replayed send (same client id) does not duplicate the location', async () => {
    const { alice, send, messages } = await acceptedTrade();
    await send(alice.token, { location: place, clientId: 'client-loc-0001' });
    const again = await send(alice.token, { location: place, clientId: 'client-loc-0001' });
    expect(again.status).toBe(200);
    expect(await messages(alice.token)).toHaveLength(1);
  });
});

describe('existing messaging still works', () => {
  it('plain text, ordering and read state are unchanged', async () => {
    const { alice, bob, conv, send, messages } = await acceptedTrade();
    await send(alice.token, { body: 'one' });
    await send(bob.token, { body: 'two' });
    expect((await messages(alice.token)).map((m) => m.body)).toEqual(['one', 'two']);
    expect((await send(alice.token, {})).status).toBe(422);
    expect((await send(alice.token, { body: '   ' })).status).toBe(422);
    const read = await api(ctx.makeApp(), bob.token, 'POST', `/conversations/${conv.id}/read`);
    expect(read.status).toBe(200);
  });
});
