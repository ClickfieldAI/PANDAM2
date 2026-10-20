/**
 * Milestone 6 — rate limiting, request ids + structured logging, and crash
 * reporting, through the real HTTP stack.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { redact, scrubText } from '../src/lib/log';
import { buildEnvelope, parseDsn, reportError } from '../src/lib/monitoring';
import { POLICIES, matchPolicy } from '../src/middleware/rate-limit';

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
  vi.unstubAllGlobals();
});

type App = ReturnType<TestDb['makeApp']>;
type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string; requestId?: string } };
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

const login = (app: App, email: string, password: string, headers: Record<string, string> = {}) =>
  app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ email, password }),
    },
    testEnv,
  );

/* ----------------------------------------------------------------------- */
/* Rate limiting                                                            */
/* ----------------------------------------------------------------------- */

describe('rate limiting: policy table', () => {
  it('is well formed and unambiguous', () => {
    const names = POLICIES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of POLICIES) {
      expect(p.limit).toBeGreaterThan(0);
      expect(p.windowSec).toBeGreaterThanOrEqual(60);
      expect(['user', 'ip']).toContain(p.by);
    }
  });

  it('matches the abuse-prone writes and leaves reads alone', () => {
    expect(matchPolicy('POST', '/offers')?.name).toBe('offers.create');
    expect(matchPolicy('POST', '/offers/ofr_1/counter')?.name).toBe('offers.counter');
    expect(matchPolicy('POST', '/conversations/cnv_1/messages')?.name).toBe('messages.send');
    expect(matchPolicy('POST', '/listings/lst_1/images')?.name).toBe('uploads');
    expect(matchPolicy('POST', '/profiles/me/avatar')?.name).toBe('uploads');
    expect(matchPolicy('POST', '/auth/login')?.name).toBe('auth.login');
    for (const [m, p] of [
      ['GET', '/offers'],
      ['GET', '/conversations/cnv_1/messages'],
      ['GET', '/listings'],
      ['GET', '/auth/me'],
    ] as const) {
      expect(matchPolicy(m, p), `${m} ${p}`).toBeNull();
    }
  });

  it('never lets one pattern swallow another (a path matches at most one policy)', () => {
    const samples: [string, string][] = [
      ['POST', '/offers'],
      ['POST', '/offers/x/counter'],
      ['POST', '/offers/x/respond'],
      ['POST', '/conversations/x/messages'],
      ['POST', '/conversations/x/attachments'],
      ['POST', '/listings'],
      ['DELETE', '/listings/x'],
      ['POST', '/listings/x/images'],
      ['PUT', '/blocks/x'],
      ['PUT', '/favourites/x'],
      ['POST', '/reports'],
      ['POST', '/reports/disputes'],
    ];
    for (const [m, p] of samples) {
      expect(
        POLICIES.filter((x) => x.method === m && x.path.test(p)),
        `${m} ${p}`,
      ).toHaveLength(1);
    }
  });
});

describe('rate limiting: per-user write limits', () => {
  it('lets a normal amount through, then answers 429 with Retry-After and the standard error', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const targets = await Promise.all(
      Array.from({ length: 31 }, (_, i) => user(app, `Target${i}x`)),
    );
    const put = (t: AuthSession) =>
      app.request(`/api/v1/blocks/${t.user.id}`, { method: 'PUT', headers: H(me.token) }, testEnv);

    const statuses: number[] = [];
    let last: Response | null = null;
    for (const t of targets) {
      last = await put(t);
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    const body = await json<Err>(last!);
    expect(body.error.code).toBe('too_many_requests');
    expect(body.error.message).toMatch(/try again in \d+ seconds/i);
    const retry = Number(last!.headers.get('Retry-After'));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(3600);
    expect(last!.headers.get('RateLimit-Limit')).toBe('30');
    expect(last!.headers.get('RateLimit-Remaining')).toBe('0');
  });

  it('reports the remaining allowance on successful responses', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const t = await user(app, 'Target');
    const res = await app.request(
      `/api/v1/blocks/${t.user.id}`,
      { method: 'PUT', headers: H(me.token) },
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('30');
    expect(res.headers.get('RateLimit-Remaining')).toBe('29');
  });

  it('limits each person separately', async () => {
    const app = ctx.makeApp();
    const a = await user(app, 'Ann');
    const b = await user(app, 'Ben');
    const t = await user(app, 'Target');
    for (let i = 0; i < 31; i += 1) {
      await app.request(
        `/api/v1/blocks/${t.user.id}`,
        { method: 'PUT', headers: H(a.token) },
        testEnv,
      );
    }
    expect(
      (
        await app.request(
          `/api/v1/blocks/${t.user.id}`,
          { method: 'PUT', headers: H(a.token) },
          testEnv,
        )
      ).status,
    ).toBe(429);
    expect(
      (
        await app.request(
          `/api/v1/blocks/${t.user.id}`,
          { method: 'PUT', headers: H(b.token) },
          testEnv,
        )
      ).status,
    ).toBe(200);
  });

  it('is atomic: overlapping requests cannot slip past the limit', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const t = await user(app, 'Target');
    const results = await Promise.all(
      Array.from({ length: 45 }, () =>
        app.request(
          `/api/v1/blocks/${t.user.id}`,
          { method: 'PUT', headers: H(me.token) },
          testEnv,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(30);
    expect(results.filter((r) => r.status === 429)).toHaveLength(15);
  });

  it('applies to chat messages: 60 a minute is plenty, the 61st is refused', async () => {
    const app = ctx.makeApp();
    const alice = await user(app, 'Alice');
    const bob = await user(app, 'Bobby');
    const mk = async (t: AuthSession, title: string) =>
      (
        await json<Ok<{ item: MarketItem }>>(
          await app.request(
            '/api/v1/listings',
            {
              method: 'POST',
              headers: H(t.token),
              body: JSON.stringify({
                categoryId: catId,
                type: 'service',
                title,
                description: 'A perfectly good thing.',
                status: 'published',
              }),
            },
            testEnv,
          ),
        )
      ).data.item;
    const a = await mk(alice, 'Alice thing');
    const b = await mk(bob, 'Bob thing');
    const offer = await json<Ok<{ offer: { id: string } }>>(
      await app.request(
        '/api/v1/offers',
        {
          method: 'POST',
          headers: H(alice.token),
          body: JSON.stringify({ offeredListingId: a.id, requestedListingId: b.id }),
        },
        testEnv,
      ),
    );
    await app.request(
      `/api/v1/offers/${offer.data.offer.id}/respond`,
      { method: 'POST', headers: H(bob.token), body: JSON.stringify({ action: 'accept' }) },
      testEnv,
    );
    const conv = (await ctx.db.select().from(schema.conversations))[0]!;
    const send = (i: number) =>
      app.request(
        `/api/v1/conversations/${conv.id}/messages`,
        {
          method: 'POST',
          headers: H(alice.token),
          body: JSON.stringify({ body: `m${i}`, clientId: `client-flood-${i}0000` }),
        },
        testEnv,
      );
    const results = await Promise.all(Array.from({ length: 65 }, (_, i) => send(i)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(60);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    // The other person can still talk.
    const reply = await app.request(
      `/api/v1/conversations/${conv.id}/messages`,
      { method: 'POST', headers: H(bob.token), body: JSON.stringify({ body: 'hi' }) },
      testEnv,
    );
    expect(reply.status).toBe(201);
  });
});

describe('rate limiting: sign-in', () => {
  it('limits sign-in attempts per caller address (CF-Connecting-IP), and ignores spoofable headers', async () => {
    const app = ctx.makeApp();
    const hit = (i: number) =>
      login(app, `nobody${i}@example.com`, 'whatever 12', {
        'CF-Connecting-IP': '203.0.113.7',
        'X-Forwarded-For': `198.51.100.${i}`, // spoofing this must not buy a fresh allowance
      });
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) statuses.push((await hit(i)).status);
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    // A different address is unaffected.
    const other = await login(app, 'nobody@example.com', 'whatever 12', {
      'CF-Connecting-IP': '203.0.113.99',
    });
    expect(other.status).toBe(401);
  });

  it('does not limit by address when none is reported (local dev / tests)', async () => {
    const app = ctx.makeApp();
    for (let i = 0; i < 25; i += 1) {
      expect((await login(app, `nobody${i}@example.com`, 'whatever 12')).status).toBe(401);
    }
  });

  it('pauses an account after 8 FAILED sign-ins — even for the right password — but not for other addresses', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const email = me.user.email;
    const ip = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let i = 0; i < 8; i += 1)
      expect((await login(app, email, 'wrong password 1', ip)).status).toBe(401);
    const locked = await login(app, email, 'a valid pw 12', ip);
    expect(locked.status).toBe(429);
    expect(locked.headers.get('Retry-After')).toBeTruthy();
    // The real owner, on another network, is not locked out by someone else's guessing.
    const owner = await login(app, email, 'a valid pw 12', { 'CF-Connecting-IP': '203.0.113.50' });
    expect(owner.status).toBe(200);
  });

  it('does not count successful sign-ins against the account', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const ip = { 'CF-Connecting-IP': '203.0.113.8' };
    for (let i = 0; i < 12; i += 1)
      expect((await login(app, me.user.email, 'a valid pw 12', ip)).status).toBe(200);
    expect((await login(app, me.user.email, 'wrong password 1', ip)).status).toBe(401);
  });

  it('also bounds anonymous sign-ups per address', async () => {
    const app = ctx.makeApp();
    const reg = (i: number) =>
      app.request(
        '/api/v1/auth/register',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
          body: JSON.stringify({
            email: `new${i}@example.com`,
            password: 'a valid pw 12',
            displayName: `User${i}x`,
          }),
        },
        testEnv,
      );
    const statuses: number[] = [];
    for (let i = 0; i < 22; i += 1) statuses.push((await reg(i)).status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });
});

describe('rate limiting: storage and failure behaviour', () => {
  it('counts per window and resets in the next one', async () => {
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    expect(await repos.rateLimits.hit('k', 1000)).toBe(1);
    expect(await repos.rateLimits.hit('k', 1000)).toBe(2);
    expect(await repos.rateLimits.hit('k', 2000)).toBe(1); // new window
    expect(await repos.rateLimits.hit('other', 1000)).toBe(1); // new key
    expect(await repos.rateLimits.count('k', 1000)).toBe(2);
    expect(await repos.rateLimits.count('never', 1000)).toBe(0);
  });

  it('prunes old windows only', async () => {
    const { createRepositories } = await import('@pandam/database');
    const repos = createRepositories(ctx.db);
    await repos.rateLimits.hit('k', 1000);
    await repos.rateLimits.hit('k', 5_000_000);
    await repos.rateLimits.prune(2_000_000);
    expect(await repos.rateLimits.count('k', 1000)).toBe(0);
    expect(await repos.rateLimits.count('k', 5_000_000)).toBe(1);
  });

  it('fails OPEN: if the counter store is down, requests still succeed and the failure is logged', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const t = await user(app, 'Target');
    await ctx.db.run(sql`DROP TABLE rate_limits`);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(String(line)));
    const res = await app.request(
      `/api/v1/blocks/${t.user.id}`,
      { method: 'PUT', headers: H(me.token) },
      testEnv,
    );
    expect(res.status).toBe(200);
    expect(errors.some((l) => l.includes('rate limiter unavailable'))).toBe(true);
  });
});

/* ----------------------------------------------------------------------- */
/* Request ids + structured logging                                         */
/* ----------------------------------------------------------------------- */

describe('request ids', () => {
  it('puts X-Request-Id on every response and the same id in error bodies', async () => {
    const app = ctx.makeApp();
    const ok = await app.request('/health', {}, testEnv);
    expect(ok.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    const bad = await app.request('/api/v1/auth/me', {}, testEnv);
    const body = await json<Err>(bad);
    expect(bad.status).toBe(401);
    expect(body.error.requestId).toBe(bad.headers.get('X-Request-Id'));
  });

  it('honours a well-formed incoming id and replaces a malformed one', async () => {
    const app = ctx.makeApp();
    const good = await app.request(
      '/health',
      { headers: { 'X-Request-Id': 'trace-abc12345' } },
      testEnv,
    );
    expect(good.headers.get('X-Request-Id')).toBe('trace-abc12345');
    for (const evil of ['x', 'has space in it!!', 'a'.repeat(200), 'line\nbreak-injection']) {
      let res: Response;
      try {
        res = await app.request('/health', { headers: { 'X-Request-Id': evil } }, testEnv);
      } catch {
        continue; // an illegal header value cannot even be constructed — nothing to defend
      }
      expect(res.headers.get('X-Request-Id')).not.toBe(evil);
      expect(res.headers.get('X-Request-Id')).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    }
  });

  it('gives each request its own id', async () => {
    const app = ctx.makeApp();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1)
      ids.add((await app.request('/health', {}, testEnv)).headers.get('X-Request-Id')!);
    expect(ids.size).toBe(20);
  });
});

describe('structured logging', () => {
  it('writes one JSON line per request with ids, status and timing — and no secrets or raw URLs', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    const lines: string[] = [];
    const sink = (l: string) => void lines.push(String(l));
    vi.spyOn(console, 'log').mockImplementation(sink);
    vi.spyOn(console, 'warn').mockImplementation(sink);
    vi.spyOn(console, 'error').mockImplementation(sink);
    const res = await app.request(
      `/api/v1/offers/${newId('offer')}?secret=1&email=ann@example.com`,
      { headers: H(me.token) },
      testEnv,
    );
    const entry = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((e) => e.msg === 'request' && e.requestId === res.headers.get('X-Request-Id'));
    expect(entry).toBeTruthy();
    expect(entry).toMatchObject({
      level: 'warn',
      method: 'GET',
      status: 404,
      route: '/api/v1/offers/:id',
      userId: me.user.id,
    });
    expect(typeof entry!.durationMs).toBe('number');
    const raw = lines.join('\n');
    expect(raw).not.toContain(me.token);
    expect(raw).not.toContain('ann@example.com');
    expect(raw).not.toContain('secret=1');
    expect(raw).not.toMatch(/ofr_[0-9a-f]{32}/); // the raw id is not in the route
  });

  it('logs 5xx as errors', async () => {
    const app = ctx.makeApp();
    const me = await user(app, 'Ann');
    await ctx.db.run(sql`DROP TABLE favourites`);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((l: string) => void errors.push(String(l)));
    const res = await app.request('/api/v1/favourites/ids', { headers: H(me.token) }, testEnv);
    expect(res.status).toBe(500);
    const parsed = errors.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(
      parsed.some((e) => e.msg === 'unhandled error' && e.route === '/api/v1/favourites/ids'),
    ).toBe(true);
    expect(parsed.some((e) => e.msg === 'request' && e.level === 'error' && e.status === 500)).toBe(
      true,
    );
  });

  it('redacts credentials in anything logged', () => {
    const out = redact({
      authorization: 'Bearer abcdefghijklmnop',
      Cookie: 'pandam_session=zzz',
      password: 'hunter2',
      nested: { idToken: 'x', ok: 'fine', deeper: { secretKey: 's' } },
      list: [{ token: 't' }, 'plain'],
      note: 'sent to ann@example.com with Bearer abcdefghijklmnopqrst',
      longToken: 'A'.repeat(43),
      userId: 'usr_00d4302d787448438d7f49f26a5c9ca6',
      requestId: '123e4567-e89b-42d3-a456-426614174000',
    }) as Record<string, unknown>;
    expect(out.authorization).toBe('[redacted]');
    expect(out.Cookie).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    expect(JSON.stringify(out)).not.toMatch(
      /hunter2|abcdefghijklmnop|ann@example\.com|AAAAAAAAAAAAAAAA/,
    );
    expect((out.nested as Record<string, unknown>).idToken).toBe('[redacted]');
    expect((out.nested as Record<string, unknown>).ok).toBe('fine');
    expect(out.userId).toBe('usr_00d4302d787448438d7f49f26a5c9ca6'); // ids stay readable for correlation
    expect(out.requestId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(scrubText('mail me at bob@example.com')).toBe('mail me at [email]');
  });
});

/* ----------------------------------------------------------------------- */
/* Crash reporting                                                          */
/* ----------------------------------------------------------------------- */

const DSN = 'https://publickey123@o1.ingest.sentry.io/456';
const env = (extra: Record<string, unknown> = {}) => ({ ...testEnv, ...extra });

describe('crash reporting', () => {
  it('parses a DSN and rejects junk', () => {
    expect(parseDsn(DSN)).toEqual({
      publicKey: 'publickey123',
      host: 'o1.ingest.sentry.io',
      projectId: '456',
      protocol: 'https',
    });
    for (const bad of [undefined, '', 'not a url', 'https://host/123', 'ftp://k@h/1'])
      expect(parseDsn(bad)).toBeNull();
  });

  it('builds a three-line envelope with only the facts we choose to send', () => {
    const lines = buildEnvelope(
      {
        error: new Error('boom for ann@example.com'),
        requestId: 'req-12345678',
        method: 'POST',
        route: '/api/v1/offers/:id/respond',
        userId: 'usr_x',
        environment: 'production',
        release: 'abc123',
      },
      DSN,
    ).split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[1]!)).toEqual({ type: 'event' });
    const event = JSON.parse(lines[2]!) as Record<string, any>;
    expect(event.exception.values[0]).toMatchObject({ type: 'Error', value: 'boom for [email]' });
    expect(event).toMatchObject({
      environment: 'production',
      release: 'abc123',
      user: { id: 'usr_x' },
      tags: { requestId: 'req-12345678' },
      request: { method: 'POST', url: '/api/v1/offers/:id/respond' },
    });
    expect(JSON.stringify(event)).not.toContain('ann@example.com');
  });

  async function crash(app: App, extraEnv: Record<string, unknown> = {}) {
    const me = await user(app, 'Ann');
    await ctx.db.run(sql`DROP TABLE favourites`);
    const res = await app.request(
      '/api/v1/favourites/ids?token=SHOULD-NOT-LEAK',
      { headers: H(me.token, { Cookie: 'pandam_session=COOKIE-SHOULD-NOT-LEAK' }) },
      env(extraEnv),
    );
    await new Promise((r) => setTimeout(r, 25));
    return { res, me };
  }

  it('reports an unhandled error once, to the DSN’s ingest endpoint, matching the response’s request id', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = ctx.makeApp();
    const { res, me } = await crash(app, { SENTRY_DSN: DSN, RELEASE: 'rel-1' });

    expect(res.status).toBe(500);
    const body = await json<Err>(res);
    expect(body.error.message).toBe('Internal server error'); // generic — no internals
    expect(JSON.stringify(body)).not.toMatch(/SQLITE|favourites|stack/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://o1.ingest.sentry.io/api/456/envelope/?sentry_version=7&sentry_key=publickey123',
    );
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-sentry-envelope',
    );
    const sent = String(init.body);
    const event = JSON.parse(sent.split('\n')[2]!) as Record<string, any>;
    expect(event.tags.requestId).toBe(body.error.requestId);
    expect(event.tags.requestId).toBe(res.headers.get('X-Request-Id'));
    expect(event).toMatchObject({
      release: 'rel-1',
      environment: 'development',
      request: { method: 'GET', url: '/api/v1/favourites/ids' },
      user: { id: me.user.id },
    });
    // What must never leave the server:
    for (const secret of [me.token, 'SHOULD-NOT-LEAK', 'COOKIE-SHOULD-NOT-LEAK', me.user.email]) {
      expect(sent).not.toContain(secret);
    }
  });

  it('does nothing without a DSN', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res } = await crash(ctx.makeApp());
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never reports expected client errors (4xx)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const app = ctx.makeApp();
    expect((await app.request('/api/v1/auth/me', {}, env({ SENTRY_DSN: DSN }))).status).toBe(401);
    expect((await app.request('/nope', {}, env({ SENTRY_DSN: DSN }))).status).toBe(404);
    await new Promise((r) => setTimeout(r, 25));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failing report never changes the answer the user gets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('sentry is down');
      }),
    );
    const warnings: string[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation((l: string) => void warnings.push(String(l)));
    const { res } = await crash(ctx.makeApp(), { SENTRY_DSN: DSN });
    expect(res.status).toBe(500);
    expect((await json<Err>(res)).error.code).toBe('internal_error');
    expect(warnings.some((l) => l.includes('crash report failed'))).toBe(true);
  });

  it('reportError is safe to call with no execution context and a bad DSN', () => {
    const fetchMock = vi.fn();
    reportError(
      {
        error: new Error('x'),
        requestId: 'req-12345678',
        method: 'GET',
        route: '/x',
        environment: 'test',
      },
      { dsn: 'junk', fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
