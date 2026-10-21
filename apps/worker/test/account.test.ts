/**
 * Coverage for the account group (`/api/v1/users/me`).
 *
 * The point of these tests is the security rule, not the happy path: every
 * destructive operation must require the CURRENT password, and a session
 * belonging to somebody else must be invisible rather than merely forbidden.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession } from '@pandam/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;
beforeEach(async () => {
  ctx = await makeTestDb();
});
afterEach(() => ctx.close());

type Ok<T> = { ok: true; data: T };
const json = <T>(r: Response) => r.json() as Promise<T>;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PASSWORD = 'a valid pw 12';

async function register(name: string): Promise<AuthSession> {
  const res = await ctx.makeApp().request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name}${Math.random().toString(36).slice(2)}@example.com`,
        password: PASSWORD,
        displayName: name,
      }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(res)).data;
}

/** A second session for the same account, i.e. "signed in on another phone". */
async function loginAgain(email: string): Promise<string> {
  const res = await ctx.makeApp().request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(res)).data.token;
}

const post = (path: string, token: string, body?: unknown) =>
  ctx.makeApp().request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    testEnv,
  );

const login = (email: string, password: string) =>
  ctx.makeApp().request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
    testEnv,
  );

describe('/api/v1/users/me/sessions', () => {
  it('lists the account sessions and flags the current one', async () => {
    const me = await register('sessionlister');
    await loginAgain(me.user.email);

    const res = await ctx
      .makeApp()
      .request('/api/v1/users/me/sessions', { headers: bearer(me.token) }, testEnv);
    const body =
      await json<Ok<{ items: { id: string; current: boolean; active: boolean }[] }>>(res);

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items.filter((s) => s.current)).toHaveLength(1);
    expect(body.data.items.every((s) => s.active)).toBe(true);
    // A session list must never hand out anything replayable.
    expect(JSON.stringify(body)).not.toContain('tokenHash');
  });

  it('revoke-others ends every session except the current one', async () => {
    const me = await register('revoker');
    const otherToken = await loginAgain(me.user.email);

    const res = await post('/api/v1/users/me/sessions/revoke-others', me.token);
    expect((await json<Ok<{ revoked: number }>>(res)).data.revoked).toBe(1);

    // The caller still works; the other device is signed out.
    const mine = await ctx
      .makeApp()
      .request('/api/v1/auth/me', { headers: bearer(me.token) }, testEnv);
    const theirs = await ctx
      .makeApp()
      .request('/api/v1/auth/me', { headers: bearer(otherToken) }, testEnv);
    expect(mine.status).toBe(200);
    expect(theirs.status).toBe(401);
  });

  it('reports another account session as not found, not forbidden', async () => {
    const me = await register('nosy');
    const them = await register('victim');
    const theirSessions = await ctx
      .makeApp()
      .request('/api/v1/users/me/sessions', { headers: bearer(them.token) }, testEnv);
    const theirId = (await json<Ok<{ items: { id: string }[] }>>(theirSessions)).data.items[0]!.id;

    const res = await ctx
      .makeApp()
      .request(
        `/api/v1/users/me/sessions/${theirId}`,
        { method: 'DELETE', headers: bearer(me.token) },
        testEnv,
      );
    expect(res.status).toBe(404);
  });
});

describe('/api/v1/users/me/change-password', () => {
  it('rejects a wrong current password', async () => {
    const me = await register('wrongpw');
    const res = await post('/api/v1/users/me/change-password', me.token, {
      currentPassword: 'not my password 1',
      newPassword: 'brand new pw 34',
    });
    expect(res.status).toBe(401);
  });

  it('enforces the password policy on the new password', async () => {
    const me = await register('weakpw');
    const res = await post('/api/v1/users/me/change-password', me.token, {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(res.status).toBe(422);
  });

  it('rotates the password and signs other devices out', async () => {
    const me = await register('rotator');
    const otherToken = await loginAgain(me.user.email);

    const res = await post('/api/v1/users/me/change-password', me.token, {
      currentPassword: PASSWORD,
      newPassword: 'brand new pw 34',
    });
    expect(res.status).toBe(200);
    expect((await json<Ok<{ otherSessionsRevoked: number }>>(res)).data.otherSessionsRevoked).toBe(
      1,
    );

    // The old password is dead, the new one works, the other device is out.
    expect((await login(me.user.email, PASSWORD)).status).toBe(401);
    expect((await login(me.user.email, 'brand new pw 34')).status).toBe(200);

    const theirs = await ctx
      .makeApp()
      .request('/api/v1/auth/me', { headers: bearer(otherToken) }, testEnv);
    expect(theirs.status).toBe(401);
  });

  it('accepts the CURRENT password even when it is still in the legacy pbkdf2 format', async () => {
    const me = await register('legacychanger');

    // Simulate an account created before the chained-PBKDF2 fix: the stored
    // hash is still the old single-round format for the same PASSWORD.
    const legacyHash =
      'pbkdf2$sha256$1000$ZWZnaGlqa2xtbm9wcXJzdA$' +
      'gwLToLIwENjvfVd5c6_4ezoT6nyYoWwgOY9kJbbCdDA';
    await ctx.db
      .update(schema.credentials)
      .set({ passwordHash: legacyHash })
      .where(eq(schema.credentials.userId, me.user.id));

    // `assertPassword` (shared by change-password and account deletion) must
    // authenticate against the legacy hash just as login does.
    const res = await post('/api/v1/users/me/change-password', me.token, {
      currentPassword: PASSWORD,
      newPassword: 'brand new pw 99',
    });
    expect(res.status).toBe(200);

    const row = await ctx.db.query.credentials.findFirst({
      where: eq(schema.credentials.userId, me.user.id),
    });
    // The new password hash is current-format — a legacy-era account is
    // fully migrated the moment it changes its password, not just on login.
    expect(row?.passwordHash.startsWith('pbkdf2x2$sha256$')).toBe(true);

    expect((await login(me.user.email, PASSWORD)).status).toBe(401);
    expect((await login(me.user.email, 'brand new pw 99')).status).toBe(200);
  });
});

describe('DELETE /api/v1/users/me', () => {
  const del = (token: string, body: unknown) =>
    ctx.makeApp().request(
      '/api/v1/users/me',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...bearer(token) },
        body: JSON.stringify(body),
      },
      testEnv,
    );

  it('needs both the password and the typed confirmation', async () => {
    const me = await register('halfsure');
    expect((await del(me.token, { currentPassword: PASSWORD })).status).toBe(422);
    expect(
      (await del(me.token, { currentPassword: 'nope nope 123', confirm: 'DELETE' })).status,
    ).toBe(401);
  });

  it('ends every session for good and hides the account items', async () => {
    const me = await register('leaving');
    const app = ctx.makeApp();

    const categoryId = newId('category');
    await ctx.db
      .insert(schema.categories)
      .values([{ id: categoryId, name: 'Tools', slug: 'tools' }]);
    await app.request(
      '/api/v1/listings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...bearer(me.token) },
        body: JSON.stringify({
          categoryId,
          type: 'product',
          title: 'A thing I no longer want to trade',
          description: 'Because I am deleting my account.',
          status: 'published',
        }),
      },
      testEnv,
    );
    // Sanity: it really was discoverable before the account went away.
    const before = await ctx.makeApp().request('/api/v1/listings', {}, testEnv);
    expect((await json<Ok<{ items: unknown[] }>>(before)).data.items).toHaveLength(1);

    expect((await del(me.token, { currentPassword: PASSWORD, confirm: 'DELETE' })).status).toBe(
      200,
    );

    const after = await ctx
      .makeApp()
      .request('/api/v1/auth/me', { headers: bearer(me.token) }, testEnv);
    expect(after.status).toBe(401);
    // Login is refused with `forbidden`, not `unauthorized`: the password was
    // correct, so there is nothing left to hide from this caller — the account
    // itself is simply no longer active.
    expect((await login(me.user.email, PASSWORD)).status).toBe(403);

    // Nothing of theirs is still discoverable.
    const discover = await ctx.makeApp().request('/api/v1/listings', {}, testEnv);
    expect((await json<Ok<{ items: unknown[] }>>(discover)).data.items).toEqual([]);
  });
});
