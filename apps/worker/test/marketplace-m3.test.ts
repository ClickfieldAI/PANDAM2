/**
 * Milestone 3 — marketplace completeness: image content validation and
 * orphan cleanup, favourites, and listing/request deletion.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sniffImage } from '../src/lib/media';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';
import { makeFakeBucket, type FakeBucket } from './helpers/r2';

let ctx: TestDb;
let bucket: FakeBucket;
let env: Record<string, unknown>;
let catId = '';

beforeEach(async () => {
  ctx = await makeTestDb();
  bucket = makeFakeBucket();
  env = { ...testEnv, MEDIA: bucket.bucket };
  catId = newId('category');
  await ctx.db.insert(schema.categories).values([{ id: catId, name: 'Bikes', slug: 'bikes' }]);
});
afterEach(() => ctx.close());

type App = ReturnType<TestDb['makeApp']>;
type Ok<T> = { ok: true; data: T };
const json = <T>(r: Response) => r.json() as Promise<T>;
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

async function item(
  app: App,
  token: string,
  title: string,
  kind: 'listings' | 'needs' = 'listings',
): Promise<MarketItem> {
  const r = await app.request(
    `/api/v1/${kind}`,
    {
      method: 'POST',
      headers: H(token),
      body: JSON.stringify({
        categoryId: catId,
        type: 'product',
        title,
        description: 'Rides fine, needs a new bell.',
        status: 'published',
      }),
    },
    env,
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
    env,
  );

/* ----------------------------------------------------------------------- */
/* Image validation                                                         */
/* ----------------------------------------------------------------------- */

const SIG = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  heic: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  heif: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31],
};
const asBytes = (head: number[], total = 32) => {
  const b = new Uint8Array(total);
  b.set(head);
  return b;
};
const text = (s: string) => new TextEncoder().encode(s);

function formWith(bytes: Uint8Array, declared: string, name = 'photo.jpg'): FormData {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type: declared }));
  return form;
}
const uploadPhoto = (app: App, token: string, listingId: string, form: FormData) =>
  app.request(
    `/api/v1/listings/${listingId}/images`,
    { method: 'POST', headers: auth(token), body: form },
    env,
  );

describe('image content validation', () => {
  it('recognises each supported format by its signature', () => {
    expect(sniffImage(asBytes(SIG.jpeg).buffer)?.contentType).toBe('image/jpeg');
    expect(sniffImage(asBytes(SIG.png).buffer)?.contentType).toBe('image/png');
    expect(sniffImage(asBytes(SIG.webp).buffer)?.contentType).toBe('image/webp');
    expect(sniffImage(asBytes(SIG.heic).buffer)?.contentType).toBe('image/heic');
    expect(sniffImage(asBytes(SIG.heif).buffer)?.contentType).toBe('image/heif');
  });

  it('rejects things that are not images, however they are labelled', () => {
    for (const payload of [
      text('<html><script>alert(1)</script></html>'),
      text('%PDF-1.7 not an image'),
      text('GIF89a....'),
      text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      new Uint8Array(0),
      new Uint8Array([0xff, 0xd8]), // truncated JPEG signature
      asBytes([0x89, 0x50, 0x4e, 0x47]), // truncated PNG signature
    ]) {
      expect(sniffImage(payload.buffer as ArrayBuffer)).toBeNull();
    }
  });

  it('refuses an HTML/script payload labelled image/png and stores nothing', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ana');
    const listing = await item(app, me.token, 'A bike');
    const res = await uploadPhoto(
      app,
      me.token,
      listing.id,
      formWith(text('<script>alert(document.cookie)</script>'), 'image/png', 'evil.png'),
    );
    expect(res.status).toBe(422);
    expect(bucket.size()).toBe(0);
    expect(await ctx.db.select().from(schema.listingImages)).toHaveLength(0);
  });

  it('stores and serves the type the bytes really are, not the type the client claimed', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ana');
    const listing = await item(app, me.token, 'A bike');
    // A genuine PNG that the client mislabelled as JPEG.
    const res = await uploadPhoto(
      app,
      me.token,
      listing.id,
      formWith(asBytes(SIG.png), 'image/jpeg'),
    );
    expect(res.status).toBe(201);
    const { image } = (await json<Ok<{ image: { url: string } }>>(res)).data;
    expect(image.url).toMatch(/\.png$/);
    const served = await app.request(image.url, {}, env);
    expect(served.headers.get('content-type')).toBe('image/png');
  });

  it('applies to avatars, offer photos and chat photos too (one shared reader)', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ana');
    const bad = formWith(text('not an image at all'), 'image/jpeg');
    const avatar = await app.request(
      '/api/v1/profiles/me/avatar',
      { method: 'POST', headers: auth(me.token), body: bad },
      env,
    );
    expect(avatar.status).toBe(422);
    const offerPhoto = await app.request(
      '/api/v1/offers/attachments',
      { method: 'POST', headers: auth(me.token), body: formWith(text('nope'), 'image/png') },
      env,
    );
    expect(offerPhoto.status).toBe(422);
    expect(bucket.size()).toBe(0);
  });

  it('removes the stored object if the photo row cannot be written (no orphan)', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ana');
    const listing = await item(app, me.token, 'A bike');
    // Make the row insert fail by dropping the table it writes to.
    await ctx.db.run(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import('drizzle-orm')).sql`DROP TABLE listing_images`,
    );
    const res = await uploadPhoto(
      app,
      me.token,
      listing.id,
      formWith(asBytes(SIG.jpeg), 'image/jpeg'),
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(bucket.size()).toBe(0);
  });
});

/* ----------------------------------------------------------------------- */
/* Favourites                                                               */
/* ----------------------------------------------------------------------- */

describe('favourites', () => {
  it('requires authentication on every route', async () => {
    const app = ctx.makeApp();
    for (const [method, path] of [
      ['GET', '/favourites'],
      ['GET', '/favourites/ids'],
      ['PUT', `/favourites/${newId('listing')}`],
      ['DELETE', `/favourites/${newId('listing')}`],
    ] as const) {
      expect((await api(app, null, method, path)).status, `${method} ${path}`).toBe(401);
    }
  });

  it('saves, lists (newest first), and unsaves — persisted in the database', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Sam');
    const buyer = await user(app, 'Bea');
    const a = await item(app, seller.token, 'First bike');
    const b = await item(app, seller.token, 'Second bike');

    expect((await api(app, buyer.token, 'PUT', `/favourites/${a.id}`)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));
    expect((await api(app, buyer.token, 'PUT', `/favourites/${b.id}`)).status).toBe(200);

    expect(await ctx.db.select().from(schema.favourites)).toHaveLength(2);
    const ids = (
      await json<Ok<{ ids: string[] }>>(await api(app, buyer.token, 'GET', '/favourites/ids'))
    ).data.ids;
    expect(ids).toEqual([b.id, a.id]);
    const items = (
      await json<Ok<{ items: MarketItem[] }>>(await api(app, buyer.token, 'GET', '/favourites'))
    ).data.items;
    expect(items.map((i) => i.title)).toEqual(['Second bike', 'First bike']);

    expect((await api(app, buyer.token, 'DELETE', `/favourites/${a.id}`)).status).toBe(200);
    const after = (
      await json<Ok<{ ids: string[] }>>(await api(app, buyer.token, 'GET', '/favourites/ids'))
    ).data.ids;
    expect(after).toEqual([b.id]);
  });

  it('is idempotent and survives overlapping requests', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Sam');
    const buyer = await user(app, 'Bea');
    const a = await item(app, seller.token, 'First bike');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api(app, buyer.token, 'PUT', `/favourites/${a.id}`)),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await ctx.db.select().from(schema.favourites)).toHaveLength(1);
    // Removing twice (or removing something never saved) is fine.
    expect((await api(app, buyer.token, 'DELETE', `/favourites/${a.id}`)).status).toBe(200);
    expect((await api(app, buyer.token, 'DELETE', `/favourites/${a.id}`)).status).toBe(200);
    expect((await api(app, buyer.token, 'DELETE', `/favourites/${newId('listing')}`)).status).toBe(
      200,
    );
  });

  it('is private: one user never sees or affects another’s saved list', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Sam');
    const bea = await user(app, 'Bea');
    const cal = await user(app, 'Cal');
    const a = await item(app, seller.token, 'First bike');
    await api(app, bea.token, 'PUT', `/favourites/${a.id}`);
    const calIds = (
      await json<Ok<{ ids: string[] }>>(await api(app, cal.token, 'GET', '/favourites/ids'))
    ).data.ids;
    expect(calIds).toEqual([]);
    // Cal "unsaving" the same listing cannot remove Bea's save.
    await api(app, cal.token, 'DELETE', `/favourites/${a.id}`);
    const beaIds = (
      await json<Ok<{ ids: string[] }>>(await api(app, bea.token, 'GET', '/favourites/ids'))
    ).data.ids;
    expect(beaIds).toEqual([a.id]);
  });

  it('refuses your own listing, an unpublished one, a deleted one, and one that does not exist', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Sam');
    const buyer = await user(app, 'Bea');
    const own = await item(app, seller.token, 'Mine');
    const paused = await item(app, seller.token, 'Paused bike');
    await ctx.db
      .update(schema.listings)
      .set({ status: 'paused' })
      .where(eq(schema.listings.id, paused.id));
    const gone = await item(app, seller.token, 'Gone bike');
    await ctx.db
      .update(schema.listings)
      .set({ deletedAt: Date.now() })
      .where(eq(schema.listings.id, gone.id));

    expect((await api(app, seller.token, 'PUT', `/favourites/${own.id}`)).status).toBe(422);
    expect((await api(app, buyer.token, 'PUT', `/favourites/${paused.id}`)).status).toBe(422);
    expect((await api(app, buyer.token, 'PUT', `/favourites/${gone.id}`)).status).toBe(404);
    expect((await api(app, buyer.token, 'PUT', `/favourites/${newId('listing')}`)).status).toBe(
      404,
    );
    expect(await ctx.db.select().from(schema.favourites)).toHaveLength(0);
  });

  it('keeps a saved listing visible (with its real status) after the owner pauses it', async () => {
    const app = ctx.makeApp();
    const seller = await user(app, 'Sam');
    const buyer = await user(app, 'Bea');
    const a = await item(app, seller.token, 'First bike');
    await api(app, buyer.token, 'PUT', `/favourites/${a.id}`);
    await ctx.db
      .update(schema.listings)
      .set({ status: 'paused' })
      .where(eq(schema.listings.id, a.id));
    const items = (
      await json<Ok<{ items: MarketItem[] }>>(await api(app, buyer.token, 'GET', '/favourites'))
    ).data.items;
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('paused');
  });
});

/* ----------------------------------------------------------------------- */
/* Deleting listings and requests                                           */
/* ----------------------------------------------------------------------- */

const respond = (app: App, token: string, id: string, action: string) =>
  api(app, token, 'POST', `/offers/${id}/respond`, { action });
const notificationsOf = async (userId: string, type: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === type,
  );

describe('deleting a listing', () => {
  it('only the owner can delete; others get 403; unknown ids get 404', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const other = await user(app, 'Pat');
    const l = await item(app, owner.token, 'My bike');
    expect((await api(app, other.token, 'DELETE', `/listings/${l.id}`)).status).toBe(403);
    expect((await api(app, null, 'DELETE', `/listings/${l.id}`)).status).toBe(401);
    expect((await api(app, owner.token, 'DELETE', `/listings/${newId('listing')}`)).status).toBe(
      404,
    );
    expect(await ctx.db.select().from(schema.listings)).toHaveLength(1);
  });

  it('hard-deletes a listing nobody ever made an offer on — row, photos, saves and stored files', async () => {
    const app = ctx.makeApp();
    const owner = await user(app, 'Olly');
    const fan = await user(app, 'Fay');
    const l = await item(app, owner.token, 'My bike');
    await uploadPhoto(app, owner.token, l.id, formWith(asBytes(SIG.jpeg), 'image/jpeg'));
    await uploadPhoto(app, owner.token, l.id, formWith(asBytes(SIG.png), 'image/png'));
    await api(app, fan.token, 'PUT', `/favourites/${l.id}`);
    expect(bucket.size()).toBe(2);

    const res = await api(app, owner.token, 'DELETE', `/listings/${l.id}`);
    expect(res.status).toBe(200);
    expect((await json<Ok<{ outcome: string }>>(res)).data.outcome).toBe('deleted');

    expect(await ctx.db.select().from(schema.listings)).toHaveLength(0);
    expect(await ctx.db.select().from(schema.listingImages)).toHaveLength(0);
    expect(await ctx.db.select().from(schema.favourites)).toHaveLength(0);
    expect(bucket.size()).toBe(0);
    expect((await api(app, owner.token, 'GET', `/listings/${l.id}`)).status).toBe(404);
    // Deleting again is a clean 404, not an error.
    expect((await api(app, owner.token, 'DELETE', `/listings/${l.id}`)).status).toBe(404);
  });

  it('archives (keeps the row, hides it everywhere) a listing that has trade history', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const fan = await user(app, 'Fay');
    const offer = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    const offerId = (await json<Ok<{ offer: { id: string } }>>(offer)).data.offer.id;
    await respond(app, bob.token, offerId, 'reject'); // history exists, no open trade
    await api(app, fan.token, 'PUT', `/favourites/${a.id}`);

    const res = await api(app, alice.token, 'DELETE', `/listings/${a.id}`);
    expect(res.status).toBe(200);
    expect((await json<Ok<{ outcome: string }>>(res)).data.outcome).toBe('archived');

    const row = (
      await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, a.id))
    )[0]!;
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe('archived');
    // Hidden from every read path…
    const mine = (
      await json<Ok<{ items: MarketItem[] }>>(await api(app, alice.token, 'GET', '/listings/mine'))
    ).data.items;
    expect(mine.map((i) => i.id)).not.toContain(a.id);
    expect((await api(app, alice.token, 'GET', `/listings/${a.id}`)).status).toBe(404);
    expect(
      (await api(app, alice.token, 'PATCH', `/listings/${a.id}`, { title: 'Sneaky edit' })).status,
    ).toBe(404);
    expect(
      (await api(app, alice.token, 'POST', `/listings/${a.id}/status`, { status: 'published' }))
        .status,
    ).toBe(404);
    const disc = (
      await json<Ok<{ items: MarketItem[] }>>(await api(app, fan.token, 'GET', '/listings'))
    ).data.items;
    expect(disc.map((i) => i.id)).not.toContain(a.id);
    // …and out of saved lists, but the old offer still resolves with its title.
    expect(await ctx.db.select().from(schema.favourites)).toHaveLength(0);
    const old = (
      await json<Ok<{ offer: { offered: { title: string } } }>>(
        await api(app, alice.token, 'GET', `/offers/${offerId}`),
      )
    ).data.offer;
    expect(old.offered.title).toBe('Alice thing');
    // A second delete is a 404.
    expect((await api(app, alice.token, 'DELETE', `/listings/${a.id}`)).status).toBe(404);
  });

  it('withdraws pending offers on it and tells the other side', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const offer = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    const offerId = (await json<Ok<{ offer: { id: string } }>>(offer)).data.offer.id;

    // Bob deletes the item Alice asked for.
    const res = await api(app, bob.token, 'DELETE', `/listings/${b.id}`);
    expect(res.status).toBe(200);
    expect((await json<Ok<{ withdrawnOffers: number }>>(res)).data.withdrawnOffers).toBe(1);
    const row = (
      await ctx.db.select().from(schema.offers).where(eq(schema.offers.id, offerId))
    )[0]!;
    expect(row.status).toBe('cancelled');
    expect(await notificationsOf(alice.user.id, 'offer_cancelled')).toHaveLength(1);
    // Alice's own listing is untouched and still available.
    expect(
      (await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, a.id)))[0]!.status,
    ).toBe('published');
    // The withdrawn offer can no longer be accepted.
    expect((await respond(app, bob.token, offerId, 'accept')).status).toBe(422);
  });

  it('refuses to delete an item that is part of a trade in progress, changing nothing', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const carol = await user(app, 'Carol');
    const c = await item(app, carol.token, 'Carol thing');
    const offer = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    const offerId = (await json<Ok<{ offer: { id: string } }>>(offer)).data.offer.id;
    await respond(app, bob.token, offerId, 'accept');
    // A second, pending offer touching the same item gets auto-cancelled by the accept already;
    // make a fresh pending one on Alice's OTHER interest to prove nothing is withdrawn on refusal.
    const other = await api(app, carol.token, 'POST', '/offers', {
      offeredListingId: c.id,
      requestedListingId: (await item(app, alice.token, 'Alice second')).id,
    });
    expect(other.status).toBe(201);

    for (const [who, id] of [
      [alice, a.id],
      [bob, b.id],
    ] as const) {
      const res = await api(app, who.token, 'DELETE', `/listings/${id}`);
      expect(res.status).toBe(422);
      expect((await json<{ error: { message: string } }>(res)).error.message).toMatch(
        /trade in progress/i,
      );
    }
    const rows = await ctx.db.select().from(schema.listings);
    expect(rows.every((r) => r.deletedAt === null)).toBe(true);
    // The unrelated pending offer was not touched.
    expect(
      (await ctx.db.select().from(schema.offers)).filter((o) => o.status === 'pending'),
    ).toHaveLength(1);
  });

  it('allows deleting after the trade is finished or cancelled', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const offer = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    const offerId = (await json<Ok<{ offer: { id: string } }>>(offer)).data.offer.id;
    await respond(app, bob.token, offerId, 'accept');
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    await api(app, alice.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' });
    await api(app, bob.token, 'POST', `/transactions/${tx.id}/status`, { action: 'confirm' });

    const res = await api(app, alice.token, 'DELETE', `/listings/${a.id}`);
    expect(res.status).toBe(200);
    expect((await json<Ok<{ outcome: string }>>(res)).data.outcome).toBe('archived');
    // The completed trade still shows what was swapped.
    const view = (
      await json<Ok<{ transaction: { youGave: { title: string } } }>>(
        await api(app, alice.token, 'GET', `/transactions/${tx.id}`),
      )
    ).data.transaction;
    expect(view.youGave.title).toBe('Alice thing');
  });

  it('never hard-deletes an item an offer references — the guard is inside the DELETE statement itself', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    // The offer lands just before the delete statement runs.
    await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedListingId: b.id,
    });
    const outcome = await repos.itemLifecycle.deleteItem('listing', b.id, bob.user.id);
    expect(outcome).toBe('archived'); // never 'deleted': the offer row must survive
    expect(await ctx.db.select().from(schema.offers)).toHaveLength(1);
  });
});

describe('deleting an I NEED request', () => {
  it('hard-deletes an untouched request and archives one that received an offer', async () => {
    const app = ctx.makeApp();
    const bob = await user(app, 'Bobby');
    const alice = await user(app, 'Alice');
    const fresh = await item(app, bob.token, 'Need a bike', 'needs');
    const res = await api(app, bob.token, 'DELETE', `/needs/${fresh.id}`);
    expect((await json<Ok<{ outcome: string }>>(res)).data.outcome).toBe('deleted');
    expect(await ctx.db.select().from(schema.needs)).toHaveLength(0);

    const wanted = await item(app, bob.token, 'Need a bell', 'needs');
    const a = await item(app, alice.token, 'A bell');
    const offer = await api(app, alice.token, 'POST', '/offers', {
      offeredListingId: a.id,
      requestedNeedId: wanted.id,
    });
    expect(offer.status).toBe(201);
    const res2 = await api(app, bob.token, 'DELETE', `/needs/${wanted.id}`);
    expect((await json<Ok<{ outcome: string; withdrawnOffers: number }>>(res2)).data).toMatchObject(
      { outcome: 'archived', withdrawnOffers: 1 },
    );
    const mine = (
      await json<Ok<{ items: MarketItem[] }>>(await api(app, bob.token, 'GET', '/needs/mine'))
    ).data.items;
    expect(mine).toHaveLength(0);
    expect(await notificationsOf(alice.user.id, 'offer_cancelled')).toHaveLength(1);
  });

  it('is owner-only', async () => {
    const app = ctx.makeApp();
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');
    const need = await item(app, bob.token, 'Need a bike', 'needs');
    expect((await api(app, eve.token, 'DELETE', `/needs/${need.id}`)).status).toBe(403);
  });
});
