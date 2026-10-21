/**
 * Security regression tests. These are written so that a NEW route, header or
 * setting that weakens the API fails here and forces a conscious decision:
 *
 *  - every registered route is swept for authentication,
 *  - cross-user access (IDOR) is attempted on every kind of resource,
 *  - CORS, CSRF, cookies, headers, mass-assignment, injection, body size and
 *    error leakage are each checked directly.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;
let catId = '';

beforeEach(async () => {
  ctx = await makeTestDb();
  catId = newId('category');
  await ctx.db.insert(schema.categories).values([{ id: catId, name: 'Design', slug: 'design' }]);
});
afterEach(() => {
  ctx.close();
  vi.restoreAllMocks();
});

type App = ReturnType<TestDb['makeApp']>;
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string; requestId?: string } };
const json = <T>(r: Response) => r.json() as Promise<T>;
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const PROD = { PANDAM_ENV: 'production', CORS_ORIGINS: 'https://app.pandam.test' };

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

async function item(
  app: App,
  token: string,
  title: string,
  kind: 'listings' | 'needs' = 'listings',
) {
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
      }),
    },
    testEnv,
  );
  return (await json<Ok<{ item: MarketItem }>>(r)).data.item;
}

/* ----------------------------------------------------------------------- */
/* Authentication sweep over every registered route                         */
/* ----------------------------------------------------------------------- */

/**
 * The ONLY routes reachable without signing in, and why. Adding a route that
 * is not authenticated means adding it here, deliberately.
 */
const PUBLIC: Record<string, string> = {
  'GET /': 'service banner',
  'GET /health': 'liveness probe',
  'GET /api/v1': 'API description',
  'GET /api/v1/categories': 'category list for browsing',
  'GET /api/v1/listings': 'public discovery (published items only)',
  'GET /api/v1/listings/cities': 'public discovery filter',
  'GET /api/v1/listings/:id': 'public item page (drafts visible to owner only)',
  'GET /api/v1/needs': 'public discovery (published items only)',
  'GET /api/v1/needs/:id': 'public item page (drafts visible to owner only)',
  'GET /api/v1/media/*': 'serves already-public photos',
  'GET /api/v1/reviews/users/:userId': 'public reputation',
  'POST /api/v1/auth/register': 'creates an account',
  'POST /api/v1/auth/login': 'signs in',
  'POST /api/v1/auth/oauth': 'signs in with a provider token (verified server-side)',
  'POST /api/v1/auth/logout': 'idempotent sign-out',
  'POST /api/v1/payments/webhook': 'authenticated by Razorpay HMAC signature instead',
};

describe('every route requires authentication unless deliberately public', () => {
  const routes = () =>
    ctx
      .makeApp()
      .routes.filter((r) => r.method !== 'ALL')
      .map((r) => ({ method: r.method, path: r.path }))
      .filter(
        (r, i, all) => all.findIndex((x) => x.method === r.method && x.path === r.path) === i,
      );

  it('registers a meaningful number of routes (the sweep is not vacuous)', () => {
    expect(routes().length).toBeGreaterThan(80);
  });

  it('answers 401 to an anonymous request on every non-public route', async () => {
    const app = ctx.makeApp();
    const open: string[] = [];
    for (const { method, path } of routes()) {
      if (PUBLIC[`${method} ${path}`]) continue;
      const url = path.replace(/:[A-Za-z]+/g, 'x').replace(/\*/g, 'x');
      const res = await app.request(
        url,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
        },
        testEnv,
      );
      if (res.status !== 401) open.push(`${method} ${path} → ${res.status}`);
    }
    expect(open, 'routes reachable without authentication:\n' + open.join('\n')).toEqual([]);
  });

  it('every public route is still registered (the allowlist does not rot)', () => {
    const registered = new Set(routes().map((r) => `${r.method} ${r.path}`));
    const stale = Object.keys(PUBLIC).filter((k) => !registered.has(k));
    expect(stale).toEqual([]);
  });

  it('rejects garbage, expired-looking and revoked credentials', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    for (const bad of [
      '',
      'Bearer',
      'Bearer ',
      'Bearer not-a-real-token',
      `Bearer ${'a'.repeat(500)}`,
      'Basic dXNlcjpwYXNz',
    ]) {
      const res = await app.request(
        '/api/v1/auth/me',
        { headers: { Authorization: bad } },
        testEnv,
      );
      expect(res.status, bad.slice(0, 20)).toBe(401);
    }
    // A bad cookie is equally unauthenticated.
    expect(
      (
        await app.request(
          '/api/v1/auth/me',
          { headers: { Cookie: 'pandam_session=forged' } },
          testEnv,
        )
      ).status,
    ).toBe(401);
    // After sign-out the same token is dead.
    expect((await app.request('/api/v1/auth/me', { headers: H(me.token) }, testEnv)).status).toBe(
      200,
    );
    await app.request('/api/v1/auth/logout', { method: 'POST', headers: H(me.token) }, testEnv);
    expect((await app.request('/api/v1/auth/me', { headers: H(me.token) }, testEnv)).status).toBe(
      401,
    );
  });
});

/* ----------------------------------------------------------------------- */
/* Cross-user access                                                        */
/* ----------------------------------------------------------------------- */

describe('one user can never act on another user’s data', () => {
  it('is refused on listings, requests, offers, transactions, conversations and notifications', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const eve = await user(app, 'Eve');
    const a = await item(app, alice.token, 'Alice thing');
    const b = await item(app, bob.token, 'Bob thing');
    const need = await item(app, alice.token, 'Alice needs a thing', 'needs');
    const offer = (
      await json<Ok<{ offer: { id: string } }>>(
        await app.request(
          '/api/v1/offers',
          {
            method: 'POST',
            headers: H(alice.token),
            body: JSON.stringify({ offeredListingId: a.id, requestedListingId: b.id }),
          },
          testEnv,
        ),
      )
    ).data.offer;
    await app.request(
      `/api/v1/offers/${offer.id}/respond`,
      { method: 'POST', headers: H(bob.token), body: JSON.stringify({ action: 'accept' }) },
      testEnv,
    );
    const tx = (await ctx.db.select().from(schema.barterTransactions))[0]!;
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const note = (await ctx.db.select().from(schema.notifications))[0]!;

    const attempts: [string, string, unknown?][] = [
      ['PATCH', `/listings/${a.id}`, { title: 'Hijacked' }],
      ['POST', `/listings/${a.id}/status`, { status: 'archived' }],
      ['DELETE', `/listings/${a.id}`],
      ['POST', `/listings/${a.id}/images`],
      ['PATCH', `/needs/${need.id}`, { title: 'Hijacked' }],
      ['DELETE', `/needs/${need.id}`],
      ['GET', `/offers/${offer.id}`],
      ['GET', `/offers/${offer.id}/history`],
      ['POST', `/offers/${offer.id}/respond`, { action: 'accept' }],
      ['POST', `/offers/${offer.id}/counter`, { offeredListingId: a.id, requestedListingId: b.id }],
      ['GET', `/transactions/${tx.id}`],
      ['POST', `/transactions/${tx.id}/status`, { action: 'cancel' }],
      ['GET', `/conversations/${conv.id}`],
      ['GET', `/conversations/${conv.id}/messages`],
      ['POST', `/conversations/${conv.id}/messages`, { body: 'let me in' }],
      ['POST', `/conversations/${conv.id}/read`],
      ['POST', `/notifications/${note.id}/read`],
      ['POST', '/reviews', { transactionId: tx.id, rating: 1 }],
      ['GET', `/reports/disputes/${tx.id}`],
      ['POST', '/reports/disputes', { transactionId: tx.id, reason: 'x'.repeat(10) }],
    ];
    const leaks: string[] = [];
    for (const [method, path, body] of attempts) {
      const res = await app.request(
        `/api/v1${path}`,
        {
          method,
          headers: H(eve.token),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        testEnv,
      );
      if (res.status < 400 || res.status >= 500) leaks.push(`${method} ${path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);

    // And nothing changed.
    expect(
      (await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, a.id)))[0],
    ).toMatchObject({ title: 'Alice thing', status: 'traded' });
    expect((await ctx.db.select().from(schema.barterTransactions))[0]!.status).toBe('in_progress');
    expect(await ctx.db.select().from(schema.messages)).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------------- */
/* Mass assignment                                                          */
/* ----------------------------------------------------------------------- */

describe('mass assignment: a client cannot set fields it does not own', () => {
  it('ignores ownership, identity and status fields on create and update', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');

    // Create a listing "as" Bob while naming Alice as owner.
    const created = await app.request(
      '/api/v1/listings',
      {
        method: 'POST',
        headers: H(bob.token),
        body: JSON.stringify({
          categoryId: catId,
          type: 'service',
          title: 'Mine really',
          description: 'A perfectly good thing.',
          status: 'published',
          ownerId: alice.user.id,
          id: newId('listing'),
          createdAt: 1,
        }),
      },
      testEnv,
    );
    expect(created.status).toBe(201);
    const l = (await json<Ok<{ item: MarketItem }>>(created)).data.item;
    expect(l.ownerId).toBe(bob.user.id);

    // Patch it, trying to re-home it and change protected columns.
    await app.request(
      `/api/v1/listings/${l.id}`,
      {
        method: 'PATCH',
        headers: H(bob.token),
        body: JSON.stringify({
          title: 'Renamed',
          ownerId: alice.user.id,
          deletedAt: 5,
          status: 'sold',
        }),
      },
      testEnv,
    );
    const row = (
      await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, l.id))
    )[0]!;
    expect(row).toMatchObject({
      ownerId: bob.user.id,
      title: 'Renamed',
      status: 'published',
      deletedAt: null,
    });

    // Profile: identity/status fields in the body must not touch the account.
    const before = (
      await ctx.db.select().from(schema.users).where(eq(schema.users.id, bob.user.id))
    )[0]!;
    await app.request(
      '/api/v1/profiles/me',
      {
        method: 'PATCH',
        headers: H(bob.token),
        body: JSON.stringify({
          bio: 'hello',
          userId: alice.user.id,
          email: 'takeover@example.com',
          status: 'suspended',
          identityVerificationStatus: 'verified',
        }),
      },
      testEnv,
    );
    const after = (
      await ctx.db.select().from(schema.users).where(eq(schema.users.id, bob.user.id))
    )[0]!;
    expect(after.email).toBe(before.email);
    expect(after.status).toBe(before.status);
    expect(after.identityVerificationStatus).toBe(before.identityVerificationStatus);
    const profiles = await ctx.db.select().from(schema.profiles);
    expect(profiles.find((p) => p.userId === alice.user.id)?.bio).not.toBe('hello');
    expect(profiles.find((p) => p.userId === bob.user.id)?.bio).toBe('hello');
  });
});

/* ----------------------------------------------------------------------- */
/* Injection and input handling                                             */
/* ----------------------------------------------------------------------- */

describe('input handling', () => {
  it('treats search text as data: SQL metacharacters and LIKE wildcards do not widen the query', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    await item(app, me.token, 'Plain bike');
    const search = async (q: string) =>
      (
        await json<Ok<{ items: MarketItem[] }>>(
          await app.request(`/api/v1/listings?q=${encodeURIComponent(q)}`, {}, testEnv),
        )
      ).data.items;

    expect(await search("'; DROP TABLE listings; --")).toEqual([]);
    expect(await search("' OR '1'='1")).toEqual([]);
    expect(await search('%')).toEqual([]); // a bare wildcard must not match everything
    expect(await search('_____')).toEqual([]);
    expect((await search('bike')).map((i) => i.title)).toEqual(['Plain bike']);
    // The table is intact.
    expect(await ctx.db.select().from(schema.listings)).toHaveLength(1);
  });

  it('refuses oversized JSON bodies before reading them', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const huge = JSON.stringify({ bio: 'x'.repeat(200_000) });
    const res = await app.request(
      '/api/v1/profiles/me',
      { method: 'PATCH', headers: H(me.token), body: huge },
      testEnv,
    );
    expect(res.status).toBe(413);
    expect((await json<Err>(res)).error.code).toBe('payload_too_large');
  });

  it('rejects malformed JSON and wrong types with a validation error, not a crash', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const post = (body: string) =>
      app.request('/api/v1/listings', { method: 'POST', headers: H(me.token), body }, testEnv);
    expect((await post('{not json')).status).toBe(400);
    expect((await post('null')).status).toBeLessThan(500);
    expect((await post('[]')).status).toBeLessThan(500);
    expect(
      (await post(JSON.stringify({ categoryId: { $ne: null }, type: 5, title: ['x'] }))).status,
    ).toBe(422);
  });

  it('does not leak internals in error responses', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    await ctx.db.run(sql`DROP TABLE favourites`);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await app.request('/api/v1/favourites/ids', { headers: H(me.token) }, testEnv);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/SQLITE|libsql|drizzle|node_modules|at .*\(.*:\d+/i);
    expect(JSON.parse(text).error.message).toBe('Internal server error');
  });
});

/* ----------------------------------------------------------------------- */
/* CORS, CSRF, cookies, headers                                             */
/* ----------------------------------------------------------------------- */

describe('CORS', () => {
  const preflight = (app: App, origin: string, env: Record<string, unknown>) =>
    app.request(
      '/api/v1/offers',
      {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      },
      env,
    );

  it('allows only the configured origins in production — never localhost', async () => {
    const app = ctx.makeApp();
    const ok = await preflight(app, 'https://app.pandam.test', PROD);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.pandam.test');
    expect(ok.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    for (const origin of [
      'https://evil.example',
      'http://localhost:3000',
      'http://127.0.0.1:8081',
      'http://192.168.1.20:8081',
      'null',
    ]) {
      const res = await preflight(app, origin, PROD);
      expect(res.headers.get('Access-Control-Allow-Origin'), origin).toBeNull();
    }
  });

  it('allows local development origins only in development', async () => {
    const app = ctx.makeApp();
    for (const origin of [
      'http://localhost:3000',
      'http://192.168.1.20:8081',
      'http://10.0.0.5:8082',
    ]) {
      expect(
        (await preflight(app, origin, testEnv)).headers.get('Access-Control-Allow-Origin'),
        origin,
      ).toBe(origin);
    }
    expect(
      (await preflight(app, 'https://evil.example', testEnv)).headers.get(
        'Access-Control-Allow-Origin',
      ),
    ).toBeNull();
  });

  it('never answers with a wildcard together with credentials', async () => {
    const app = ctx.makeApp();
    for (const env of [PROD, testEnv]) {
      const res = await preflight(app, 'https://app.pandam.test', env);
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    }
  });
});

describe('CSRF: cookie-authenticated writes must come from an allowed origin', () => {
  async function cookieFor(app: App) {
    const me = await user(app, 'Ann');
    return { me, cookie: `pandam_session=${me.token}` };
  }
  const writeWith = (app: App, headers: Record<string, string>, env: Record<string, unknown>) =>
    app.request(
      '/api/v1/blocks/' + newId('user'),
      { method: 'PUT', headers: { 'Content-Type': 'text/plain', ...headers }, body: '{}' },
      env,
    );

  it('blocks a cross-site request that rides the session cookie (even as a "simple" text/plain POST)', async () => {
    const app = ctx.makeApp();
    const { cookie } = await cookieFor(app);
    const evil = await writeWith(app, { Cookie: cookie, Origin: 'https://evil.example' }, PROD);
    expect(evil.status).toBe(403);
    expect((await json<Err>(evil)).error.code).toBe('forbidden');
  });

  it('lets the real web app through, and exempts bearer-token clients and origin-less clients', async () => {
    const app = ctx.makeApp();
    const { me, cookie } = await cookieFor(app);
    // Allowed origin + cookie: not stopped by the CSRF guard (it reaches the route → 404 unknown user).
    expect(
      (await writeWith(app, { Cookie: cookie, Origin: 'https://app.pandam.test' }, PROD)).status,
    ).not.toBe(403);
    // A bearer token cannot be attached by another site, so the origin does not matter.
    expect(
      (
        await writeWith(
          app,
          { Authorization: `Bearer ${me.token}`, Origin: 'https://evil.example' },
          PROD,
        )
      ).status,
    ).not.toBe(403);
    // No Origin at all is not a browser cross-site request.
    expect((await writeWith(app, { Cookie: cookie }, PROD)).status).not.toBe(403);
  });

  it('never interferes with reads', async () => {
    const app = ctx.makeApp();
    const { cookie } = await cookieFor(app);
    const res = await app.request(
      '/api/v1/auth/me',
      { headers: { Cookie: cookie, Origin: 'https://evil.example' } },
      PROD,
    );
    expect(res.status).toBe(200);
  });
});

describe('session cookie and response headers', () => {
  it('sets the session cookie HttpOnly, Secure, SameSite=None, with an expiry', async () => {
    const app = ctx.makeApp();
    const res = await app.request(
      '/api/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'cookie@example.com',
          password: 'a valid pw 12',
          displayName: 'Cookie',
        }),
      },
      testEnv,
    );
    const cookie = res.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^pandam_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=None/i);
    expect(cookie).toMatch(/Expires=/i);
  });

  it('sends the standard hardening headers on API responses', async () => {
    const app = ctx.makeApp();
    const res = await app.request('/api/v1/categories', {}, testEnv);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toMatch(/SAMEORIGIN|DENY/i);
    expect(res.headers.get('Referrer-Policy')).toBeTruthy();
    expect(res.headers.get('Strict-Transport-Security')).toBeTruthy();
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });
});

describe('credentials at rest', () => {
  it('stores a salted, slow PBKDF2 hash — never the password — and never returns it', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const cred = (await ctx.db.select().from(schema.credentials))[0]!;
    expect(cred.passwordHash).not.toContain('a valid pw 12');
    const [scheme, hash, iterations] = cred.passwordHash.split('$');
    expect(scheme).toBe('pbkdf2x2');
    expect(hash).toBe('sha256');
    // Per-round iterations — the Workers runtime rejects a single PBKDF2
    // call above 100,000 (see crypto.ts), so this is now the per-round
    // floor, not a single-call total.
    expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
    // Two accounts with the same password get different hashes (per-user salt).
    await user(app, 'Ben');
    const hashes = (await ctx.db.select().from(schema.credentials)).map((c) => c.passwordHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    // Session tokens are stored hashed, so a database leak does not yield usable sessions.
    const sessions = await ctx.db.select().from(schema.sessions);
    expect(JSON.stringify(sessions)).not.toContain(me.token);
  });
});
