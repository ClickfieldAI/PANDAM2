/**
 * Milestone 7 — admin. Access control first (a full role matrix over every
 * admin route), then each tool: suspension, takedown, report review,
 * transaction inspection — and the audit trail behind all of them.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem } from '@pandam/types';
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
type Err = { ok: false; error: { code: string; message: string } };
const json = <T>(r: Response) => r.json() as Promise<T>;
const H = (t: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const data = async <T>(r: Response) => (await json<Ok<T>>(r)).data;
const errorOf = async (r: Response) => (await json<Err>(r)).error;

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

/** Staff are made by a direct database update — there is no API for the first admin. */
async function staff(app: App, name: string, role: 'moderator' | 'admin'): Promise<AuthSession> {
  const s = await user(app, name);
  await ctx.db.update(schema.users).set({ role }).where(eq(schema.users.id, s.user.id));
  return s;
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
        type: 'service',
        title,
        description: 'A perfectly good thing to trade.',
        status: 'published',
      }),
    },
    testEnv,
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
    testEnv,
  );

const REASON = { reason: 'Violates the posting rules.' };
const auditRows = () => ctx.db.select().from(schema.adminAuditLog);
const notificationsOf = async (userId: string, type: string) =>
  (await ctx.db.select().from(schema.notifications)).filter(
    (n) => n.userId === userId && n.type === type,
  );

/* ----------------------------------------------------------------------- */
/* Access control                                                           */
/* ----------------------------------------------------------------------- */

describe('access control', () => {
  /** Every admin route, with who may call it. `adminOnly` routes refuse moderators. */
  const ROUTES: { method: string; path: string; body?: unknown; adminOnly?: boolean }[] = [
    { method: 'GET', path: '/admin/users' },
    { method: 'GET', path: `/admin/users/${newId('user')}` },
    { method: 'POST', path: `/admin/users/${newId('user')}/suspend`, body: REASON },
    { method: 'POST', path: `/admin/users/${newId('user')}/unsuspend`, body: REASON },
    {
      method: 'POST',
      path: `/admin/users/${newId('user')}/role`,
      body: { role: 'moderator', ...REASON },
      adminOnly: true,
    },
    { method: 'GET', path: '/admin/reports' },
    { method: 'GET', path: `/admin/reports/${newId('report')}` },
    {
      method: 'POST',
      path: `/admin/reports/${newId('report')}/review`,
      body: { status: 'reviewing' },
    },
    { method: 'GET', path: `/admin/listings/${newId('listing')}` },
    { method: 'POST', path: `/admin/listings/${newId('listing')}/takedown`, body: REASON },
    { method: 'POST', path: `/admin/listings/${newId('listing')}/reinstate`, body: REASON },
    { method: 'GET', path: `/admin/needs/${newId('need')}` },
    { method: 'POST', path: `/admin/needs/${newId('need')}/takedown`, body: REASON },
    { method: 'POST', path: `/admin/needs/${newId('need')}/reinstate`, body: REASON },
    { method: 'GET', path: '/admin/transactions' },
    { method: 'GET', path: `/admin/transactions/${newId('barterTransaction')}` },
    { method: 'GET', path: '/admin/audit', adminOnly: true },
  ];

  it('covers every registered admin route (the matrix cannot silently go stale)', () => {
    const registered = ctx
      .makeApp()
      .routes.filter((r) => r.path.startsWith('/api/v1/admin') && r.method !== 'ALL')
      .map((r) => `${r.method} ${r.path.replace('/api/v1', '').replace(/:[A-Za-z]+/g, 'X')}`);
    const covered = new Set(
      ROUTES.map(
        (r) => `${r.method} ${r.path.replace(/(usr|lst|ned|rpt|btx)_[0-9a-f]{32}/g, 'X')}`,
      ),
    );
    // `*` middleware entries are not routes; compare concrete ones only.
    const missing = [...new Set(registered)].filter((r) => !r.includes('*') && !covered.has(r));
    expect(missing).toEqual([]);
  });

  it('anonymous → 401, ordinary user → 403, moderator → admin-only routes 403, admin → allowed', async () => {
    const app = ctx.makeApp();
    const nobody = await user(app, 'Nobody');
    const mod = await staff(app, 'Mod', 'moderator');
    const admin = await staff(app, 'Root', 'admin');

    for (const r of ROUTES) {
      const label = `${r.method} ${r.path}`;
      expect((await api(app, null, r.method, r.path, r.body)).status, `anon ${label}`).toBe(401);
      expect((await api(app, nobody.token, r.method, r.path, r.body)).status, `user ${label}`).toBe(
        403,
      );
      const asMod = (await api(app, mod.token, r.method, r.path, r.body)).status;
      if (r.adminOnly) expect(asMod, `mod ${label}`).toBe(403);
      else expect(asMod, `mod ${label}`).not.toBe(403);
      // Admin passes the gate: the ids above do not exist, so 404/200 — never 401/403.
      const asAdmin = (await api(app, admin.token, r.method, r.path, r.body)).status;
      expect([401, 403], `admin ${label}`).not.toContain(asAdmin);
    }
  });

  it('a role in the request is ignored: only the database decides', async () => {
    const app = ctx.makeApp();
    const nobody = await user(app, 'Sneaky');
    const res = await app.request(
      '/api/v1/admin/users',
      {
        headers: { ...H(nobody.token), 'X-Role': 'admin', 'X-User-Role': 'admin' },
      },
      testEnv,
    );
    expect(res.status).toBe(403);
    // Nor can a user promote themselves through the profile / account APIs.
    await api(app, nobody.token, 'PATCH', '/profiles/me', { role: 'admin', displayName: 'Sneaky' });
    const [row] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, nobody.user.id));
    expect(row?.role).toBe('user');
    expect(
      (await data<{ user: { role: string } }>(await api(app, nobody.token, 'GET', '/auth/me'))).user
        .role,
    ).toBe('user');
  });

  it('a demotion takes effect on the very next request; a suspended admin is signed out', async () => {
    const app = ctx.makeApp();
    const boss = await staff(app, 'Boss', 'admin');
    const second = await staff(app, 'Second', 'admin');
    expect((await api(app, second.token, 'GET', '/admin/users')).status).toBe(200);

    const demote = await api(app, boss.token, 'POST', `/admin/users/${second.user.id}/role`, {
      role: 'user',
      ...REASON,
    });
    expect(demote.status).toBe(200);
    expect((await api(app, second.token, 'GET', '/admin/users')).status).toBe(403);

    const third = await staff(app, 'Third', 'moderator');
    await api(app, boss.token, 'POST', `/admin/users/${third.user.id}/suspend`, REASON);
    expect((await api(app, third.token, 'GET', '/admin/users')).status).toBe(401);
  });

  it('exposes the role to the app on /auth/me (cosmetic — the server enforces)', async () => {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const me = await data<{ user: { role: string } }>(await api(app, mod.token, 'GET', '/auth/me'));
    expect(me.user.role).toBe('moderator');
  });
});

describe('guards', () => {
  it('nobody changes themselves; moderators cannot touch staff; the last admin stays', async () => {
    const app = ctx.makeApp();
    const admin = await staff(app, 'Root', 'admin');
    const mod = await staff(app, 'Mod', 'moderator');
    const plain = await user(app, 'Plain');

    expect(
      (await api(app, admin.token, 'POST', `/admin/users/${admin.user.id}/suspend`, REASON)).status,
    ).toBe(422);
    expect(
      (
        await api(app, admin.token, 'POST', `/admin/users/${admin.user.id}/role`, {
          role: 'user',
          ...REASON,
        })
      ).status,
    ).toBe(422);
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${mod.user.id}/suspend`, REASON)).status,
    ).toBe(422);

    // A moderator may act on ordinary users, never on staff.
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${admin.user.id}/suspend`, REASON)).status,
    ).toBe(403);
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${plain.user.id}/suspend`, REASON)).status,
    ).toBe(200);

    // The last active admin cannot be demoted or suspended — even by another admin path.
    const other = await staff(app, 'Other', 'admin');
    expect(
      (
        await api(app, other.token, 'POST', `/admin/users/${admin.user.id}/role`, {
          role: 'user',
          ...REASON,
        })
      ).status,
    ).toBe(200); // two admins: fine
    // Now `other` is the only admin left; the database statement itself refuses.
    const refused = await ctx
      .makeApp()
      .request('/api/v1/admin/users', { headers: H(other.token) }, testEnv);
    expect(refused.status).toBe(200);
    const direct = await (
      await import('@pandam/database')
    )
      .createRepositories(ctx.db)
      .admin.setRole(other.user.id, 'user');
    expect(direct).toBeNull();
    const suspendLast = await (
      await import('@pandam/database')
    )
      .createRepositories(ctx.db)
      .admin.suspendUser(other.user.id, 'test');
    expect(suspendLast).toBeNull();
  });

  it('requires a real reason on every mutation, validates ids, and records nothing when refused', async () => {
    const app = ctx.makeApp();
    const admin = await staff(app, 'Root', 'admin');
    const plain = await user(app, 'Plain');
    for (const body of [undefined, {}, { reason: '' }, { reason: 'no' }, { reason: '    ' }]) {
      const r = await api(app, admin.token, 'POST', `/admin/users/${plain.user.id}/suspend`, body);
      expect(r.status).toBe(body === undefined ? 400 : 422);
    }
    expect((await auditRows()).filter((a) => a.action === 'user.suspend')).toHaveLength(0);
    const [row] = await ctx.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, plain.user.id));
    expect(row?.status).toBe('active');
    expect(
      (await api(app, admin.token, 'POST', `/admin/users/${newId('user')}/suspend`, REASON)).status,
    ).toBe(404);
  });
});

/* ----------------------------------------------------------------------- */
/* Suspension                                                               */
/* ----------------------------------------------------------------------- */

describe('user suspension', () => {
  async function scene() {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const sam = await user(app, 'Sam');
    const ann = await user(app, 'Ann');
    const samItem = await item(app, sam.token, 'Sam logo design');
    const annItem = await item(app, ann.token, 'Ann copywriting');
    return { app, mod, sam, ann, samItem, annItem };
  }

  it('signs them out, refuses login, hides their items, and is fully reversible', async () => {
    const { app, mod, sam, ann, samItem } = await scene();
    const email = (
      await ctx.db.select().from(schema.users).where(eq(schema.users.id, sam.user.id))
    )[0]!.email;

    const res = await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/suspend`, REASON);
    expect(res.status).toBe(200);
    expect((await data<{ user: { status: string } }>(res)).user.status).toBe('suspended');

    // Existing session is dead; login says so.
    expect((await api(app, sam.token, 'GET', '/auth/me')).status).toBe(401);
    const login = await api(app, null, 'POST', '/auth/login', { email, password: 'a valid pw 12' });
    expect(login.status).toBe(403);
    expect((await errorOf(login)).message).toMatch(/suspended/i);

    // Gone from discovery, detail, matches and recommendations — for everyone else.
    const list = await data<{ items: { id: string }[] }>(
      await api(app, ann.token, 'GET', '/listings'),
    );
    expect(list.items.map((i) => i.id)).not.toContain(samItem.id);
    expect((await api(app, ann.token, 'GET', `/listings/${samItem.id}`)).status).toBe(404);
    expect((await api(app, null, 'GET', `/listings/${samItem.id}`)).status).toBe(404);

    // Nothing was deleted: unsuspending brings it all back.
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/unsuspend`, REASON)).status,
    ).toBe(200);
    expect(
      (await api(app, null, 'POST', '/auth/login', { email, password: 'a valid pw 12' })).status,
    ).toBe(200);
    expect((await api(app, ann.token, 'GET', `/listings/${samItem.id}`)).status).toBe(200);
    const again = await data<{ items: { id: string }[] }>(
      await api(app, ann.token, 'GET', '/listings'),
    );
    expect(again.items.map((i) => i.id)).toContain(samItem.id);
  });

  it('cannot be offered to, accepted from, or messaged; a trade already underway is untouched', async () => {
    const { app, mod, sam, ann, samItem, annItem } = await scene();
    // An accepted trade exists before the suspension.
    const offer = await data<{ offer: { id: string } }>(
      await api(app, ann.token, 'POST', '/offers', {
        offeredListingId: annItem.id,
        requestedListingId: samItem.id,
      }),
    );
    await api(app, sam.token, 'POST', `/offers/${offer.offer.id}/respond`, { action: 'accept' });
    const [tx] = await ctx.db.select().from(schema.barterTransactions);
    expect(tx?.status).toBe('in_progress');

    await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/suspend`, REASON);

    // The counterparty can still cancel the trade (items are committed to it).
    const cancel = await api(app, ann.token, 'POST', `/transactions/${tx!.id}/status`, {
      action: 'cancel',
    });
    expect(cancel.status, await cancel.clone().text()).toBe(200);

    // New contact with the suspended person is refused, with neutral wording.
    const third = await item(app, ann.token, 'Ann second thing');
    const fresh = await api(app, ann.token, 'POST', '/offers', {
      offeredListingId: third.id,
      requestedListingId: samItem.id,
    });
    expect([403, 422, 404]).toContain(fresh.status);
    expect(fresh.status).not.toBe(201);
  });

  it('is conflict-safe: suspending twice, or unsuspending an active user, is a 409', async () => {
    const { app, mod, sam } = await scene();
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/unsuspend`, REASON)).status,
    ).toBe(409);
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/suspend`, REASON)).status,
    ).toBe(200);
    expect(
      (await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/suspend`, REASON)).status,
    ).toBe(409);
  });

  it('records who, what and why — and the log cannot be edited through the API', async () => {
    const { app, mod, sam } = await scene();
    await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/suspend`, {
      reason: 'Repeated spam offers',
    });
    const rows = (await auditRows()).filter((a) => a.action === 'user.suspend');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: mod.user.id,
      targetType: 'user',
      targetId: sam.user.id,
      reason: 'Repeated spam offers',
    });
    const admin = await staff(app, 'Root', 'admin');
    for (const m of ['PUT', 'PATCH', 'DELETE', 'POST']) {
      const r = await api(app, admin.token, m, `/admin/audit/${rows[0]!.id}`, {});
      expect([404, 405]).toContain(r.status);
    }
    expect((await auditRows()).filter((a) => a.action === 'user.suspend')).toHaveLength(1);
  });

  it('audits viewing a user (it shows an email) and searching by text, but not plain listing', async () => {
    const { app, mod, sam } = await scene();
    await api(app, mod.token, 'GET', '/admin/users');
    expect(await auditRows()).toHaveLength(0);
    const found = await data<{ items: { id: string; email: string }[] }>(
      await api(app, mod.token, 'GET', `/admin/users?q=${encodeURIComponent('sam')}`),
    );
    expect(found.items.map((u) => u.id)).toContain(sam.user.id);
    await api(app, mod.token, 'GET', `/admin/users/${sam.user.id}`);
    const actions = (await auditRows()).map((a) => a.action).sort();
    expect(actions).toEqual(['user.search', 'user.view']);
    // The search text itself (which may be an email) is not stored.
    expect(JSON.stringify(await auditRows())).not.toContain('sam');
  });

  it('only an admin can change roles, and the change is audited with from/to', async () => {
    const { app, mod, sam } = await scene();
    const admin = await staff(app, 'Root', 'admin');
    expect(
      (
        await api(app, mod.token, 'POST', `/admin/users/${sam.user.id}/role`, {
          role: 'moderator',
          ...REASON,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(app, admin.token, 'POST', `/admin/users/${sam.user.id}/role`, {
          role: 'moderator',
          ...REASON,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await api(app, admin.token, 'POST', `/admin/users/${sam.user.id}/role`, {
          role: 'moderator',
          ...REASON,
        })
      ).status,
    ).toBe(409);
    const row = (await auditRows()).find((a) => a.action === 'user.role');
    expect(JSON.parse(row!.metadata!)).toEqual({ from: 'user', to: 'moderator' });
    const log = await data<{ items: { action: string }[] }>(
      await api(app, admin.token, 'GET', '/admin/audit'),
    );
    expect(log.items.map((i) => i.action)).toContain('user.role');
  });
});

/* ----------------------------------------------------------------------- */
/* Takedown                                                                 */
/* ----------------------------------------------------------------------- */

describe('listing takedown', () => {
  it('removes the item from circulation, withdraws offers, tells everyone, and blocks re-publishing', async () => {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const sam = await user(app, 'Sam');
    const ann = await user(app, 'Ann');
    const samItem = await item(app, sam.token, 'Dodgy listing');
    const annItem = await item(app, ann.token, 'Ann thing');
    const offer = await data<{ offer: { id: string } }>(
      await api(app, ann.token, 'POST', '/offers', {
        offeredListingId: annItem.id,
        requestedListingId: samItem.id,
      }),
    );

    const res = await api(app, mod.token, 'POST', `/admin/listings/${samItem.id}/takedown`, {
      reason: 'Prohibited item',
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await data<{ withdrawnOffers: number }>(res)).withdrawnOffers).toBe(1);

    const [o] = await ctx.db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.id, offer.offer.id));
    expect(o?.status).toBe('cancelled');
    expect(await notificationsOf(sam.user.id, 'moderation_notice')).toHaveLength(1);
    expect(await notificationsOf(ann.user.id, 'offer_cancelled')).toHaveLength(1);

    const list = await data<{ items: { id: string }[] }>(
      await api(app, ann.token, 'GET', '/listings'),
    );
    expect(list.items.map((i) => i.id)).not.toContain(samItem.id);
    expect((await api(app, ann.token, 'GET', `/listings/${samItem.id}`)).status).toBe(404);

    // The owner cannot just publish it again, and is told why.
    const republish = await api(app, sam.token, 'POST', `/listings/${samItem.id}/status`, {
      status: 'published',
    });
    expect(republish.status).toBe(403);
    expect((await errorOf(republish)).message).toContain('Prohibited item');
    expect(
      (await api(app, mod.token, 'POST', `/admin/listings/${samItem.id}/takedown`, REASON)).status,
    ).toBe(409);

    // Reinstating clears the marker but does not republish: the owner decides.
    expect(
      (await api(app, mod.token, 'POST', `/admin/listings/${samItem.id}/reinstate`, REASON)).status,
    ).toBe(200);
    const view = await data<{ item: { status: string; removedAt: number | null } }>(
      await api(app, mod.token, 'GET', `/admin/listings/${samItem.id}`),
    );
    expect(view.item).toMatchObject({ status: 'archived', removedAt: null });
    expect(
      (await api(app, sam.token, 'POST', `/listings/${samItem.id}/status`, { status: 'published' }))
        .status,
    ).toBe(200);
    expect(
      (await api(app, mod.token, 'POST', `/admin/listings/${samItem.id}/reinstate`, REASON)).status,
    ).toBe(409);

    expect((await auditRows()).map((a) => a.action)).toEqual(
      expect.arrayContaining(['listing.takedown', 'listing.reinstate']),
    );
  });

  it('works for needs too, and a cancelled trade cannot resurrect a removed listing', async () => {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const sam = await user(app, 'Sam');
    const ann = await user(app, 'Ann');
    const need = await item(app, sam.token, 'Need something', 'needs');
    expect(
      (await api(app, mod.token, 'POST', `/admin/needs/${need.id}/takedown`, REASON)).status,
    ).toBe(200);
    expect(
      (await api(app, sam.token, 'POST', `/needs/${need.id}/status`, { status: 'published' }))
        .status,
    ).toBe(403);

    // Trade in progress -> item removed -> trade cancelled: item must stay removed.
    const a = await item(app, ann.token, 'Alpha item');
    const b = await item(app, sam.token, 'Bravo item');
    const offer = await data<{ offer: { id: string } }>(
      await api(app, ann.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, sam.token, 'POST', `/offers/${offer.offer.id}/respond`, { action: 'accept' });
    await api(app, mod.token, 'POST', `/admin/listings/${b.id}/takedown`, REASON);
    const [tx] = await ctx.db.select().from(schema.barterTransactions);
    await api(app, ann.token, 'POST', `/transactions/${tx!.id}/status`, { action: 'cancel' });
    const [row] = await ctx.db.select().from(schema.listings).where(eq(schema.listings.id, b.id));
    expect(row?.status).toBe('archived');
    expect((await api(app, null, 'GET', `/listings/${b.id}`)).status).toBe(404);
  });
});

/* ----------------------------------------------------------------------- */
/* Report review                                                            */
/* ----------------------------------------------------------------------- */

describe('report review', () => {
  async function filed() {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const sam = await user(app, 'Sam');
    const ann = await user(app, 'Ann');
    const bea = await user(app, 'Bea');
    const target = await item(app, sam.token, 'Questionable thing');
    const r1 = await data<{ report: { id: string } }>(
      await api(app, ann.token, 'POST', '/reports', {
        subjectType: 'listing',
        subjectId: target.id,
        reason: 'spam',
      }),
    );
    await api(app, bea.token, 'POST', '/reports', {
      subjectType: 'listing',
      subjectId: target.id,
      reason: 'scam',
    });
    return { app, mod, sam, ann, bea, target, reportId: r1.report.id };
  }

  it('lists and filters, and shows evidence, current state of the subject, and related reports', async () => {
    const { app, mod, target, reportId } = await filed();
    const open = await data<{ items: { id: string }[] }>(
      await api(app, mod.token, 'GET', '/admin/reports?status=open'),
    );
    expect(open.items).toHaveLength(2);
    const none = await data<{ items: unknown[] }>(
      await api(app, mod.token, 'GET', '/admin/reports?status=resolved'),
    );
    expect(none.items).toHaveLength(0);
    expect((await api(app, mod.token, 'GET', '/admin/reports?status=bogus')).status).toBe(422);

    const detail = await data<{
      report: {
        snapshot: { title?: string } | null;
        subject: { exists: boolean; label: string; takenDown: boolean };
        related: unknown[];
        reporter: { id: string } | null;
      };
    }>(await api(app, mod.token, 'GET', `/admin/reports/${reportId}`));
    expect(detail.report.snapshot?.title).toBe('Questionable thing');
    expect(detail.report.subject).toMatchObject({
      exists: true,
      label: 'Questionable thing',
      takenDown: false,
    });
    expect(detail.report.related).toHaveLength(1);
    expect(detail.report.reporter).not.toBeNull();

    // The subject is edited / removed afterwards: the snapshot still shows what was reported.
    await api(app, mod.token, 'POST', `/admin/listings/${target.id}/takedown`, REASON);
    const after = await data<{
      report: { subject: { takenDown: boolean }; snapshot: { title?: string } };
    }>(await api(app, mod.token, 'GET', `/admin/reports/${reportId}`));
    expect(after.report.subject.takenDown).toBe(true);
    expect(after.report.snapshot.title).toBe('Questionable thing');
  });

  it('follows open → reviewing → resolved; closing needs a note; closed is final; the reporter is told', async () => {
    const { app, mod, ann, reportId } = await filed();
    const review = (body: unknown) =>
      api(app, mod.token, 'POST', `/admin/reports/${reportId}/review`, body);

    expect((await review({ status: 'reviewing' })).status).toBe(200);
    expect((await review({ status: 'reviewing' })).status).toBe(409); // already there
    expect((await review({ status: 'resolved' })).status).toBe(422); // needs a note
    expect(await notificationsOf(ann.user.id, 'report_update')).toHaveLength(0);

    const done = await review({ status: 'resolved', note: 'Removed the listing.' });
    expect(done.status).toBe(200);
    const body = await data<{
      report: { status: string; reviewedBy: string; resolutionNote: string };
    }>(done);
    expect(body.report).toMatchObject({
      status: 'resolved',
      reviewedBy: mod.user.id,
      resolutionNote: 'Removed the listing.',
    });
    expect(await notificationsOf(ann.user.id, 'report_update')).toHaveLength(1);

    for (const status of ['open', 'reviewing', 'dismissed', 'resolved']) {
      expect((await review({ status, note: 'trying again' })).status, status).toBe(409);
    }
    expect((await review({ status: 'nonsense' })).status).toBe(422);
    expect(
      (
        await api(app, mod.token, 'POST', `/admin/reports/${newId('report')}/review`, {
          status: 'reviewing',
        })
      ).status,
    ).toBe(404);
    expect((await auditRows()).filter((a) => a.action === 'report.review')).toHaveLength(2);
  });

  it('a reporter can file again once the earlier report is closed', async () => {
    const { app, mod, ann, target, reportId } = await filed();
    await api(app, mod.token, 'POST', `/admin/reports/${reportId}/review`, {
      status: 'dismissed',
      note: 'Not a violation.',
    });
    const again = await api(app, ann.token, 'POST', '/reports', {
      subjectType: 'listing',
      subjectId: target.id,
      reason: 'spam',
    });
    expect(again.status).toBe(201);
  });
});

/* ----------------------------------------------------------------------- */
/* Transactions                                                             */
/* ----------------------------------------------------------------------- */

describe('transaction inspection', () => {
  it('is read-only and shows parties, items, events and disputes', async () => {
    const app = ctx.makeApp();
    const mod = await staff(app, 'Mod', 'moderator');
    const sam = await user(app, 'Sam');
    const ann = await user(app, 'Ann');
    const a = await item(app, ann.token, 'Ann item');
    const b = await item(app, sam.token, 'Sam item');
    const offer = await data<{ offer: { id: string } }>(
      await api(app, ann.token, 'POST', '/offers', {
        offeredListingId: a.id,
        requestedListingId: b.id,
      }),
    );
    await api(app, sam.token, 'POST', `/offers/${offer.offer.id}/respond`, { action: 'accept' });
    const [tx] = await ctx.db.select().from(schema.barterTransactions);

    const list = await data<{ items: { id: string; status: string }[] }>(
      await api(app, mod.token, 'GET', '/admin/transactions'),
    );
    expect(list.items.map((t) => t.id)).toEqual([tx!.id]);
    expect(
      (
        await data<{ items: unknown[] }>(
          await api(app, mod.token, 'GET', '/admin/transactions?status=completed'),
        )
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await data<{ items: unknown[] }>(
          await api(app, mod.token, 'GET', `/admin/transactions?userId=${ann.user.id}`),
        )
      ).items,
    ).toHaveLength(1);

    const detail = await data<{
      transaction: {
        offeredItem: { title: string } | null;
        requestedItem: { title: string } | null;
        events: { type: string }[];
        initiatedBy: string;
      };
    }>(await api(app, mod.token, 'GET', `/admin/transactions/${tx!.id}`));
    expect(detail.transaction.offeredItem?.title).toBe('Ann item');
    expect(detail.transaction.requestedItem?.title).toBe('Sam item');
    expect(detail.transaction.events.map((e) => e.type)).toContain('accepted');

    // No way to change a transaction from the admin namespace.
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await api(app, mod.token, m, `/admin/transactions/${tx!.id}`, {
        status: 'completed',
      });
      expect([404, 405]).toContain(r.status);
    }
    const [after] = await ctx.db.select().from(schema.barterTransactions);
    expect(after?.status).toBe(tx?.status);
    expect((await auditRows()).filter((a) => a.action === 'transaction.view')).toHaveLength(1);
  });
});

describe('does not leak', () => {
  it('admin responses never contain password hashes, tokens or session data', async () => {
    const app = ctx.makeApp();
    const admin = await staff(app, 'Root', 'admin');
    const sam = await user(app, 'Sam');
    const bodies = [
      await (await api(app, admin.token, 'GET', '/admin/users')).text(),
      await (await api(app, admin.token, 'GET', `/admin/users/${sam.user.id}`)).text(),
      await (await api(app, admin.token, 'GET', '/admin/audit')).text(),
    ].join('\n');
    expect(bodies).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash|\$pbkdf2|"token"/i);
  });
});
