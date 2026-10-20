/**
 * Listing photos and avatars: upload to R2, read back through `/media`, and
 * the rules that stop the upload path being abused (foreign listings, bad
 * content types, oversized files, the per-listing cap).
 *
 * R2 is a fake in-memory bucket (`helpers/r2`) — the interesting behaviour is
 * in the route, not in Cloudflare's storage.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

type Ok<T> = { ok: true; data: T };
const json = <T>(r: Response) => r.json() as Promise<T>;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function register(name: string): Promise<AuthSession> {
  const res = await ctx.makeApp().request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name}${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a valid pw 12',
        displayName: name,
      }),
    },
    env,
  );
  return (await json<Ok<AuthSession>>(res)).data;
}

async function createListing(token: string, title = 'A bike'): Promise<MarketItem> {
  const res = await ctx.makeApp().request(
    '/api/v1/listings',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
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
  return (await json<Ok<{ item: MarketItem }>>(res)).data.item;
}

async function createNeed(token: string, title = 'I need a bike'): Promise<MarketItem> {
  const res = await ctx.makeApp().request(
    '/api/v1/needs',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
      body: JSON.stringify({
        categoryId: catId,
        type: 'product',
        title,
        description: 'Mine was stolen, sadly.',
        status: 'published',
      }),
    },
    env,
  );
  return (await json<Ok<{ item: MarketItem }>>(res)).data.item;
}

/** The first bytes a real file of each type starts with. */
const SIGNATURES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

/** A multipart body carrying one real-looking "image" of the given type and size. */
function imageForm(type = 'image/jpeg', bytes = 32): FormData {
  const data = new Uint8Array(bytes);
  data.set(SIGNATURES[type] ?? []);
  const form = new FormData();
  form.append('file', new File([data], 'photo.jpg', { type }));
  return form;
}

const upload = (listingId: string, token: string, form: FormData) =>
  ctx
    .makeApp()
    .request(
      `/api/v1/listings/${listingId}/images`,
      { method: 'POST', headers: bearer(token), body: form },
      env,
    );

describe('listing photos', () => {
  it('uploads to R2 and exposes the photo on the listing', async () => {
    const me = await register('photographer');
    const listing = await createListing(me.token);

    const res = await upload(listing.id, me.token, imageForm());
    expect(res.status).toBe(201);
    const { image } = (await json<Ok<{ image: { id: string; url: string } }>>(res)).data;

    // The key is server-chosen and namespaced by listing; the client never
    // picks it, and the returned URL is the path the app fetches.
    expect(bucket.keys()).toHaveLength(1);
    expect(bucket.keys()[0]).toMatch(new RegExp(`^listings/${listing.id}/[0-9a-f-]+\\.jpg$`));
    expect(image.url).toBe(`/api/v1/media/${bucket.keys()[0]}`);

    const detail = await ctx.makeApp().request(`/api/v1/listings/${listing.id}`, {}, env);
    const item = (await json<Ok<{ item: MarketItem }>>(detail)).data.item;
    expect(item.images).toEqual([{ id: image.id, url: image.url, sortOrder: 0 }]);
  });

  it('serves the bytes back through /media without auth', async () => {
    const me = await register('server');
    const listing = await createListing(me.token);
    const res = await upload(listing.id, me.token, imageForm());
    const { image } = (await json<Ok<{ image: { url: string } }>>(res)).data;

    // No Authorization header: listing photos are already public content.
    const fetched = await ctx.makeApp().request(image.url, {}, env);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/jpeg');
    expect(fetched.headers.get('cache-control')).toContain('immutable');
  });

  it('lets a browser on another origin actually render the photo', async () => {
    const me = await register('embedder');
    const listing = await createListing(me.token);
    const res = await upload(listing.id, me.token, imageForm());
    const { image } = (await json<Ok<{ image: { url: string } }>>(res)).data;

    const fetched = await ctx.makeApp().request(image.url, {}, env);
    // The app is served from a different origin than the API, so the default
    // `same-origin` policy would make the browser refuse to paint the image
    // into an <img> even though the request itself succeeded. This is the
    // header that bug turned on, so it is worth pinning.
    expect(fetched.headers.get('cross-origin-resource-policy')).toBe('cross-origin');

    // Every other route keeps the stricter default.
    const api = await ctx.makeApp().request('/api/v1', {}, env);
    expect(api.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('appends photos in upload order and caps them at six', async () => {
    const me = await register('hoarder');
    const listing = await createListing(me.token);

    for (let i = 0; i < 6; i += 1) {
      expect((await upload(listing.id, me.token, imageForm())).status).toBe(201);
    }
    const overflow = await upload(listing.id, me.token, imageForm());
    expect(overflow.status).toBe(422);
    expect(bucket.size()).toBe(6);

    const detail = await ctx.makeApp().request(`/api/v1/listings/${listing.id}`, {}, env);
    const item = (await json<Ok<{ item: MarketItem }>>(detail)).data.item;
    expect(item.images?.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('refuses a listing somebody else owns', async () => {
    const owner = await register('owner');
    const stranger = await register('stranger');
    const listing = await createListing(owner.token);

    const res = await upload(listing.id, stranger.token, imageForm());
    expect(res.status).toBe(403);
    expect(bucket.size()).toBe(0);
  });

  it('rejects a non-image content type', async () => {
    const me = await register('pdfsender');
    const listing = await createListing(me.token);

    const res = await upload(listing.id, me.token, imageForm('application/pdf'));
    expect(res.status).toBe(422);
    expect(bucket.size()).toBe(0);
  });

  it('accepts a real photo even when the client sends an empty or generic content type (Android)', async () => {
    const me = await register('androiduser');
    const listing = await createListing(me.token);
    for (const declared of ['', 'application/octet-stream', 'image/jpg']) {
      const data = new Uint8Array(64);
      data.set([0xff, 0xd8, 0xff, 0xe0]);
      const form = new FormData();
      form.append('file', new File([data], 'IMG_1000012345', { type: declared }));
      const res = await upload(listing.id, me.token, form);
      expect(res.status, `declared "${declared}"`).toBe(201);
    }
    // The stored type is what the bytes are, not what the client claimed.
    expect(bucket.keys()).toHaveLength(3);
    expect(bucket.keys().every((k) => k.endsWith('.jpg'))).toBe(true);
  });

  it('rejects an image over the size cap', async () => {
    const me = await register('bigfile');
    const listing = await createListing(me.token);

    const res = await upload(listing.id, me.token, imageForm('image/png', 9 * 1024 * 1024));
    expect(res.status).toBe(422);
    expect(bucket.size()).toBe(0);
  });

  it('deletes a photo and its object', async () => {
    const me = await register('deleter');
    const listing = await createListing(me.token);
    const res = await upload(listing.id, me.token, imageForm());
    const { image } = (await json<Ok<{ image: { id: string } }>>(res)).data;

    const del = await ctx
      .makeApp()
      .request(
        `/api/v1/listings/${listing.id}/images/${image.id}`,
        { method: 'DELETE', headers: bearer(me.token) },
        env,
      );
    expect(del.status).toBe(200);
    expect(bucket.size()).toBe(0);

    const detail = await ctx.makeApp().request(`/api/v1/listings/${listing.id}`, {}, env);
    expect((await json<Ok<{ item: MarketItem }>>(detail)).data.item.images).toEqual([]);
  });

  it('says so clearly when R2 is not configured', async () => {
    const me = await register('nobucket');
    const listing = await createListing(me.token);

    // `testEnv` has no MEDIA binding — the same situation as a deployment
    // where the r2_buckets block is still commented out.
    const res = await ctx
      .makeApp()
      .request(
        `/api/v1/listings/${listing.id}/images`,
        { method: 'POST', headers: bearer(me.token), body: imageForm() },
        testEnv,
      );
    expect(res.status).toBe(503);
  });
});

describe('need photos', () => {
  const uploadNeed = (needId: string, token: string, form: FormData) =>
    ctx
      .makeApp()
      .request(
        `/api/v1/needs/${needId}/images`,
        { method: 'POST', headers: bearer(token), body: form },
        env,
      );

  it('uploads a reference photo to R2 and exposes it on the need', async () => {
    const me = await register('wanter');
    const need = await createNeed(me.token);

    const res = await uploadNeed(need.id, me.token, imageForm());
    expect(res.status).toBe(201);
    const { image } = (await json<Ok<{ image: { id: string; url: string } }>>(res)).data;

    expect(bucket.keys()).toHaveLength(1);
    expect(bucket.keys()[0]).toMatch(new RegExp(`^needs/${need.id}/[0-9a-f-]+\\.jpg$`));
    expect(image.url).toBe(`/api/v1/media/${bucket.keys()[0]}`);

    const detail = await ctx.makeApp().request(`/api/v1/needs/${need.id}`, {}, env);
    const item = (await json<Ok<{ item: MarketItem }>>(detail)).data.item;
    expect(item.images).toEqual([{ id: image.id, url: image.url, sortOrder: 0 }]);
  });

  it('serves a need photo back through /media without auth', async () => {
    const me = await register('wanter2');
    const need = await createNeed(me.token);
    const res = await uploadNeed(need.id, me.token, imageForm());
    const { image } = (await json<Ok<{ image: { url: string } }>>(res)).data;

    const fetched = await ctx.makeApp().request(image.url, {}, env);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/jpeg');
  });

  it('refuses a need somebody else owns', async () => {
    const owner = await register('needowner');
    const stranger = await register('needstranger');
    const need = await createNeed(owner.token);

    const res = await uploadNeed(need.id, stranger.token, imageForm());
    expect(res.status).toBe(403);
    expect(bucket.size()).toBe(0);
  });

  it('deletes a need photo and its object', async () => {
    const me = await register('needdeleter');
    const need = await createNeed(me.token);
    const res = await uploadNeed(need.id, me.token, imageForm());
    const { image } = (await json<Ok<{ image: { id: string } }>>(res)).data;

    const del = await ctx
      .makeApp()
      .request(
        `/api/v1/needs/${need.id}/images/${image.id}`,
        { method: 'DELETE', headers: bearer(me.token) },
        env,
      );
    expect(del.status).toBe(200);
    expect(bucket.size()).toBe(0);

    const detail = await ctx.makeApp().request(`/api/v1/needs/${need.id}`, {}, env);
    expect((await json<Ok<{ item: MarketItem }>>(detail)).data.item.images).toEqual([]);
  });
});

describe('avatars', () => {
  it('stores the avatar and returns a URL on the profile', async () => {
    const me = await register('facehaver');

    const res = await ctx
      .makeApp()
      .request(
        '/api/v1/profiles/me/avatar',
        { method: 'POST', headers: bearer(me.token), body: imageForm('image/png') },
        env,
      );
    expect(res.status).toBe(200);
    const { profile } = (await json<Ok<{ profile: { avatarUrl: string | null } }>>(res)).data;
    expect(profile.avatarUrl).toMatch(/^\/api\/v1\/media\/avatars\//);
    expect(bucket.size()).toBe(1);
  });

  it('replaces the previous avatar object rather than accumulating them', async () => {
    const me = await register('rebrander');
    const first = await ctx
      .makeApp()
      .request(
        '/api/v1/profiles/me/avatar',
        { method: 'POST', headers: bearer(me.token), body: imageForm('image/png') },
        env,
      );
    const firstUrl = (await json<Ok<{ profile: { avatarUrl: string } }>>(first)).data.profile
      .avatarUrl;

    await ctx
      .makeApp()
      .request(
        '/api/v1/profiles/me/avatar',
        { method: 'POST', headers: bearer(me.token), body: imageForm('image/webp') },
        env,
      );

    expect(bucket.size()).toBe(1);
    // A new key every time, so caches cannot keep showing the old face.
    const now = await ctx
      .makeApp()
      .request('/api/v1/profiles/me', { headers: bearer(me.token) }, env);
    const currentUrl = (await json<Ok<{ profile: { avatarUrl: string } }>>(now)).data.profile
      .avatarUrl;
    expect(currentUrl).not.toBe(firstUrl);
  });
});
