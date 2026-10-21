import { type AuthSession, type AuthenticatedUser } from '@pandam/types';
import { schema } from '@pandam/database';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;

beforeEach(async () => {
  ctx = await makeTestDb();
});
afterEach(() => ctx.close());

const VALID = {
  email: 'Alice@Example.com',
  password: 'correct horse 7',
  displayName: 'Alice',
  username: 'alice',
};

async function body<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
type Ok<T> = { ok: true; data: T };
type Err = {
  ok: false;
  error: { code: string; message: string; details?: Record<string, string[]>; requestId?: string };
};

function register(app: ReturnType<TestDb['makeApp']>, patch: Record<string, unknown> = {}) {
  return app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID, ...patch }),
    },
    testEnv,
  );
}

function login(app: ReturnType<TestDb['makeApp']>, patch: Record<string, unknown> = {}) {
  return app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: VALID.email, password: VALID.password, ...patch }),
    },
    testEnv,
  );
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('POST /api/v1/auth/register', () => {
  it('creates the account, profile and session; normalises the email', async () => {
    const app = ctx.makeApp();
    const res = await register(app);
    expect(res.status).toBe(201);

    const { data } = await body<Ok<AuthSession>>(res);
    expect(data.user.email).toBe('alice@example.com');
    expect(data.user.id).toMatch(/^usr_[0-9a-f]{32}$/);
    expect(data.profile?.displayName).toBe('Alice');
    expect(data.profile?.username).toBe('alice');
    expect(typeof data.token).toBe('string');
    expect(data.expiresAt).toBeGreaterThan(Date.now());

    // Set-Cookie present, HttpOnly, not readable by JS
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/pandam_session=/);
    expect(cookie.toLowerCase()).toContain('httponly');

    // never leaks secrets
    const raw = JSON.stringify(data);
    expect(raw).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash|pbkdf2/i);
  });

  it('rejects an invalid email (422)', async () => {
    const res = await register(ctx.makeApp(), { email: 'not-an-email' });
    expect(res.status).toBe(422);
    const b = await body<Err>(res);
    expect(b.error.code).toBe('validation_error');
    expect(b.error.details?.email).toBeTruthy();
  });

  it('rejects a weak password (422) and never echoes it', async () => {
    const res = await register(ctx.makeApp(), { password: 'short' });
    expect(res.status).toBe(422);
    const b = await body<Err>(res);
    expect(b.error.details?.password).toBeTruthy();
    expect(JSON.stringify(b)).not.toContain('short');
  });

  it('rejects a duplicate email (409)', async () => {
    const app = ctx.makeApp();
    expect((await register(app)).status).toBe(201);
    const res = await register(app, { username: 'alice2' });
    expect(res.status).toBe(409);
    expect((await body<Err>(res)).error.code).toBe('conflict');
  });

  it('rejects a duplicate username (409)', async () => {
    const app = ctx.makeApp();
    expect((await register(app)).status).toBe(201);
    const res = await register(app, { email: 'bob@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('authenticates valid credentials and issues a session', async () => {
    const app = ctx.makeApp();
    await register(app);
    const res = await login(app);
    expect(res.status).toBe(200);
    const { data } = await body<Ok<AuthSession>>(res);
    expect(data.user.email).toBe('alice@example.com');
    expect(data.token).toBeTruthy();
  });

  it('rejects a wrong password with a generic 401', async () => {
    const app = ctx.makeApp();
    await register(app);
    const res = await login(app, { password: 'wrong but long 9' });
    expect(res.status).toBe(401);
    const b = await body<Err>(res);
    expect(b.error.code).toBe('unauthorized');
    expect(b.error.message).toBe('Invalid email or password');
  });

  it('gives the SAME response for a nonexistent account (no user enumeration)', async () => {
    const app = ctx.makeApp();
    const missing = await login(app, { email: 'ghost@example.com', password: 'whatever 12' });
    await register(app);
    const wrongPw = await login(app, { password: 'still wrong 3' });

    expect(missing.status).toBe(wrongPw.status);
    // Identical in everything a caller can learn from — only the per-request
    // correlation id (different for every request by design) may differ.
    const strip = ({ requestId: _requestId, ...rest }: Err['error']) => rest;
    expect(strip((await body<Err>(missing)).error)).toEqual(
      strip((await body<Err>(wrongPw)).error),
    );
  });

  it('logs in with a legacy pbkdf2 (single-round) hash and transparently upgrades it', async () => {
    const app = ctx.makeApp();
    const regRes = await register(app);
    const { data: regData } = await body<Ok<AuthSession>>(regRes);

    // Simulate an account created before the chained-PBKDF2 fix: overwrite
    // the freshly-created (current-format) hash with a real legacy-format
    // one for the same password, generated with the exact PBKDF2-HMAC-SHA-256
    // primitive the old single-round code used.
    const legacyHash =
      'pbkdf2$sha256$1000$FRYXGBkaGxwdHh8gISIjJA$' + 'whFpv0e7ByCgogX5LT14JSfcPkWfeEZpxzLfQ_-P_bg';
    await ctx.db
      .update(schema.credentials)
      .set({ passwordHash: legacyHash })
      .where(eq(schema.credentials.userId, regData.user.id));

    const res = await login(app);
    expect(res.status).toBe(200);

    const row = await ctx.db.query.credentials.findFirst({
      where: eq(schema.credentials.userId, regData.user.id),
    });
    // Upgraded to the current two-round format on successful login — not
    // left as the legacy hash.
    expect(row?.passwordHash.startsWith('pbkdf2x2$sha256$')).toBe(true);
    expect(row?.passwordHash).not.toBe(legacyHash);
  });

  it('survives concurrent logins against the same legacy hash without corrupting the upgrade', async () => {
    const app = ctx.makeApp();
    const regRes = await register(app);
    const { data: regData } = await body<Ok<AuthSession>>(regRes);

    const legacyHash =
      'pbkdf2$sha256$1000$FRYXGBkaGxwdHh8gISIjJA$' + 'whFpv0e7ByCgogX5LT14JSfcPkWfeEZpxzLfQ_-P_bg';
    await ctx.db
      .update(schema.credentials)
      .set({ passwordHash: legacyHash })
      .where(eq(schema.credentials.userId, regData.user.id));

    // Five simultaneous logins race to read the (still-legacy) hash and
    // each tries to upgrade it — the concern is two concurrent
    // `updateHash` writes interleaving into something that doesn't match
    // the password at all, not just "which one wins".
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => login(app)));
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    const row = await ctx.db.query.credentials.findFirst({
      where: eq(schema.credentials.userId, regData.user.id),
    });
    expect(row?.passwordHash.startsWith('pbkdf2x2$sha256$')).toBe(true);

    // The decisive check: whatever hash concurrent writes left behind must
    // still actually verify the real password — a corrupted interleave
    // would show up here as a login failure, not as a visible exception.
    const after = await login(app);
    expect(after.status).toBe(200);
  });

  it('never exposes the password hash or its format in any auth response body', async () => {
    const app = ctx.makeApp();
    const regRes = await register(app);
    const regText = await regRes.clone().text();
    expect(regText).not.toMatch(/pbkdf2|passwordHash|password_hash/i);

    const loginRes = await login(app);
    const loginText = await loginRes.clone().text();
    expect(loginText).not.toMatch(/pbkdf2|passwordHash|password_hash/i);

    const { data } = await body<Ok<AuthSession>>(regRes);
    const meRes = await app.request('/api/v1/auth/me', { headers: auth(data.token) }, testEnv);
    const meText = await meRes.clone().text();
    expect(meText).not.toMatch(/pbkdf2|passwordHash|password_hash/i);
  });
});

describe('sessions', () => {
  it('a valid session reaches /me; the response has no secrets', async () => {
    const app = ctx.makeApp();
    const { data } = await body<Ok<AuthSession>>(await register(app));
    const res = await app.request('/api/v1/auth/me', { headers: auth(data.token) }, testEnv);
    expect(res.status).toBe(200);
    const me = await body<Ok<AuthenticatedUser>>(res);
    expect(me.data.user.id).toBe(data.user.id);
    expect(JSON.stringify(me)).not.toMatch(/pbkdf2|token_hash|password/i);
  });

  it('an unknown / malformed token is unauthorized', async () => {
    const app = ctx.makeApp();
    for (const t of ['', 'garbage', 'ses_deadbeef']) {
      const res = await app.request('/api/v1/auth/me', { headers: auth(t) }, testEnv);
      expect(res.status).toBe(401);
    }
  });

  it('logout revokes the session so it can no longer be used', async () => {
    const app = ctx.makeApp();
    const { data } = await body<Ok<AuthSession>>(await register(app));

    const out = await app.request(
      '/api/v1/auth/logout',
      { method: 'POST', headers: auth(data.token) },
      testEnv,
    );
    expect(out.status).toBe(200);
    expect((out.headers.get('set-cookie') ?? '').toLowerCase()).toMatch(
      /pandam_session=;|max-age=0/,
    );

    const after = await app.request('/api/v1/auth/me', { headers: auth(data.token) }, testEnv);
    expect(after.status).toBe(401);
  });

  it('logout is a no-op 200 when unauthenticated', async () => {
    const res = await ctx.makeApp().request('/api/v1/auth/logout', { method: 'POST' }, testEnv);
    expect(res.status).toBe(200);
  });

  it('an expired session is rejected', async () => {
    const app = ctx.makeApp();
    const { data } = await body<Ok<AuthSession>>(await register(app));
    // Force the session into the past directly in the DB.
    const { sql } = await import('drizzle-orm');
    await ctx.db.run(sql`UPDATE sessions SET expires_at = 1`);
    const res = await app.request('/api/v1/auth/me', { headers: auth(data.token) }, testEnv);
    expect(res.status).toBe(401);
  });
});
