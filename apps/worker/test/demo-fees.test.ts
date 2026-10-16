import { newId, schema } from '@pandam/database';
import { type AuthSession, type DemoFeeQuote, type DemoRevenueSummary } from '@pandam/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

let ctx: TestDb;
let catId = '';

beforeEach(async () => {
  ctx = await makeTestDb();
  catId = newId('category');
  await ctx.db.insert(schema.categories).values({ id: catId, name: 'Gear', slug: 'gear' });
});
afterEach(() => ctx.close());

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: { code: string; message: string } };
const json = <T>(r: Response) => r.json() as Promise<T>;

async function newUser(app: ReturnType<TestDb['makeApp']>): Promise<AuthSession> {
  const res = await app.request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `u${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a valid pw 12',
        displayName: 'Demo User',
      }),
    },
    testEnv,
  );
  return (await json<Ok<AuthSession>>(res)).data;
}

function call(
  app: ReturnType<TestDb['makeApp']>,
  token: string,
  method: string,
  path: string,
  body?: unknown,
  env: Record<string, unknown> = testEnv,
) {
  return app.request(
    `/api/v1/demo-fees${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

async function saleListing(
  app: ReturnType<TestDb['makeApp']>,
  token: string,
  priceAmount: number,
  transactionType: 'sale' | 'barter' = 'sale',
): Promise<string> {
  const res = await app.request(
    '/api/v1/listings',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        categoryId: catId,
        type: 'product',
        title: 'Vintage camera',
        description: 'Works perfectly, comes with the original strap.',
        status: 'published',
        transactionType,
        ...(transactionType === 'barter' ? {} : { priceAmount }),
      }),
    },
    testEnv,
  );
  expect(res.status, await res.clone().text()).toBe(201);
  const body = await json<Ok<{ item: { id: string } }>>(res);
  return body.data.item.id;
}

describe('demo fees API', () => {
  it('requires authentication', async () => {
    const app = ctx.makeApp();
    const res = await app.request('/api/v1/demo-fees/schedule', {}, testEnv);
    expect(res.status).toBe(401);
  });

  it('is disabled in production', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    const res = await call(app, u.token, 'GET', '/schedule', undefined, {
      PANDAM_ENV: 'production',
    });
    expect(res.status).toBe(403);
  });

  it('quotes a typed amount from the server-side schedule', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    const res = await call(app, u.token, 'POST', '/quote', { amount: 100_000 });
    expect(res.status).toBe(200);
    const q = (await json<Ok<{ quote: DemoFeeQuote }>>(res)).data.quote;
    expect(q).toMatchObject({ demo: true, amount: 100_000, feeAmount: 2_000, netAmount: 98_000 });
    expect(q.tier.label).toBe('₹500 – ₹2,000');
  });

  it('changes the fee when the amount crosses a tier boundary', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    const fee = async (amount: number) =>
      (
        await json<Ok<{ quote: DemoFeeQuote }>>(
          await call(app, u.token, 'POST', '/quote', { amount }),
        )
      ).data.quote.feeAmount;
    expect(await fee(50_000)).toBe(500);
    expect(await fee(50_001)).toBe(2_000);
  });

  it('quotes an existing sale listing using its stored price and rejects barter-only ones', async () => {
    const app = ctx.makeApp();
    const seller = await newUser(app);
    const buyer = await newUser(app);
    const sale = await saleListing(app, seller.token, 300_000);
    const barter = await saleListing(app, seller.token, 0, 'barter');

    const ok = await call(app, buyer.token, 'POST', '/quote', { listingId: sale });
    const q = (await json<Ok<{ quote: DemoFeeQuote }>>(ok)).data.quote;
    expect(q).toMatchObject({ amount: 300_000, feeAmount: 7_500, netAmount: 292_500 });
    expect(q.listing?.id).toBe(sale);

    const bad = await call(app, buyer.token, 'POST', '/quote', { listingId: barter });
    expect(bad.status).toBe(422);

    const list = await call(app, buyer.token, 'GET', '/listings');
    const items = (await json<Ok<{ items: { id: string }[] }>>(list)).data.items;
    expect(items.map((i) => i.id)).toEqual([sale]);
  });

  it('rejects invalid amounts and ambiguous input', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    for (const body of [
      { amount: 0 },
      { amount: -5 },
      { amount: 1.5 },
      { amount: 999 },
      {},
      { amount: 10, listingId: newId('listing') },
    ]) {
      const res = await call(app, u.token, 'POST', '/quote', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
    const huge = await call(app, u.token, 'POST', '/quote', { amount: 99_999_999_999 });
    expect(huge.status).toBe(422);
  });

  it('refuses to quote when the configured schedule is invalid', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    const env = {
      ...testEnv,
      PLATFORM_FEE_TIERS: JSON.stringify([
        { label: 'a', minAmount: 1000, maxAmount: 2000, feeAmount: 1, enabled: true },
        { label: 'b', minAmount: 5000, maxAmount: null, feeAmount: 1, enabled: true },
      ]),
    };
    const res = await call(app, u.token, 'POST', '/quote', { amount: 100 }, env);
    expect(res.status).toBe(422);
    const sched = await call(app, u.token, 'GET', '/schedule', undefined, env);
    const s = (await json<Ok<{ schedule: { valid: boolean; errors: string[] } }>>(sched)).data
      .schedule;
    expect(s.valid).toBe(false);
  });

  it('honours an environment-configured schedule', async () => {
    const app = ctx.makeApp();
    const u = await newUser(app);
    const env = {
      ...testEnv,
      PLATFORM_FEE_TIERS: JSON.stringify([
        { label: 'Flat', minAmount: 1000, maxAmount: null, feeAmount: 100, enabled: true },
      ]),
    };
    const res = await call(app, u.token, 'POST', '/quote', { amount: 100_000 }, env);
    expect((await json<Ok<{ quote: DemoFeeQuote }>>(res)).data.quote.feeAmount).toBe(100);
  });

  describe('confirm + revenue summary', () => {
    const confirm = (
      app: ReturnType<TestDb['makeApp']>,
      token: string,
      over: Record<string, unknown> = {},
    ) =>
      call(app, token, 'POST', '/confirm', {
        amount: 100_000,
        expectedFeeAmount: 2_000,
        idempotencyKey: 'key-0000-aaaa',
        ...over,
      });

    it('records a DEMO transaction and adds its fee to the revenue summary', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      const res = await confirm(app, u.token);
      expect(res.status).toBe(201);
      const body = (
        await json<Ok<{ transaction: Record<string, unknown>; replayed: boolean }>>(res)
      ).data;
      expect(body.transaction).toMatchObject({
        demo: true,
        status: 'simulated_paid',
        amount: 100_000,
        feeAmount: 2_000,
        netAmount: 98_000,
      });
      expect(body.replayed).toBe(false);

      await confirm(app, u.token, {
        amount: 10_000,
        expectedFeeAmount: 500,
        idempotencyKey: 'key-0000-bbbb',
      });
      const sum = (
        await json<Ok<{ summary: DemoRevenueSummary }>>(await call(app, u.token, 'GET', '/summary'))
      ).data.summary;
      expect(sum).toMatchObject({
        demo: true,
        count: 2,
        grossAmount: 110_000,
        feeAmount: 2_500,
        netAmount: 107_500,
      });
      expect(sum.byTier.map((t) => t.feeAmount).sort((a, b) => a - b)).toEqual([500, 2_000]);
      expect(sum.recent).toHaveLength(2);
    });

    it('is idempotent: a retried confirm never double-counts the fee', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      const first = await confirm(app, u.token);
      const second = await confirm(app, u.token);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const a = (await json<Ok<{ transaction: { id: string } }>>(first)).data.transaction.id;
      const b = await json<Ok<{ transaction: { id: string }; replayed: boolean }>>(second);
      expect(b.data.transaction.id).toBe(a);
      expect(b.data.replayed).toBe(true);
      const sum = (
        await json<Ok<{ summary: DemoRevenueSummary }>>(await call(app, u.token, 'GET', '/summary'))
      ).data.summary;
      expect(sum.count).toBe(1);
      expect(sum.feeAmount).toBe(2_000);
    });

    it('survives concurrent duplicate confirms (single row, single fee)', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      const results = await Promise.all(Array.from({ length: 5 }, () => confirm(app, u.token)));
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      const sum = (
        await json<Ok<{ summary: DemoRevenueSummary }>>(await call(app, u.token, 'GET', '/summary'))
      ).data.summary;
      expect(sum.count).toBe(1);
      expect(sum.feeAmount).toBe(2_000);
    });

    it('does not trust a client-supplied fee (stale/forged expectedFeeAmount → 409, nothing recorded)', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      const res = await confirm(app, u.token, { expectedFeeAmount: 1 });
      expect(res.status).toBe(409);
      const sum = (
        await json<Ok<{ summary: DemoRevenueSummary }>>(await call(app, u.token, 'GET', '/summary'))
      ).data.summary;
      expect(sum.count).toBe(0);
      expect(sum.feeAmount).toBe(0);
    });

    it('rejects reusing an idempotency key for a different sale', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      await confirm(app, u.token);
      const res = await confirm(app, u.token, { amount: 10_000, expectedFeeAmount: 500 });
      expect(res.status).toBe(409);
    });

    it('rejects a too-short idempotency key and requires auth', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      expect((await confirm(app, u.token, { idempotencyKey: 'short' })).status).toBe(422);
      const anon = await app.request('/api/v1/demo-fees/confirm', { method: 'POST' }, testEnv);
      expect(anon.status).toBe(401);
    });

    it('stores a fee-schedule snapshot and never touches real payments', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      await confirm(app, u.token);
      const rows = await ctx.db.select().from(schema.demoFeeTransactions);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ isDemo: 1, status: 'simulated_paid' });
      expect(JSON.parse(rows[0]!.feeSchedule).tiers.length).toBeGreaterThan(0);
      expect(await ctx.db.select().from(schema.payments)).toHaveLength(0);
    });

    it('records the listing used and leaves the listing unsold', async () => {
      const app = ctx.makeApp();
      const seller = await newUser(app);
      const buyer = await newUser(app);
      const lst = await saleListing(app, seller.token, 300_000);
      const res = await confirm(app, buyer.token, {
        amount: undefined,
        listingId: lst,
        expectedFeeAmount: 7_500,
        idempotencyKey: 'key-0000-cccc',
      });
      expect(res.status).toBe(201);
      const tx = (await json<Ok<{ transaction: { listing: { id: string; title: string } } }>>(res))
        .data.transaction;
      expect(tx.listing).toEqual({ id: lst, title: 'Vintage camera' });
      const row = await ctx.db.select().from(schema.listings);
      expect(row[0]?.status).toBe('published');
    });

    it('database CHECK rejects non-demo or inconsistent rows', async () => {
      const app = ctx.makeApp();
      const u = await newUser(app);
      const base = {
        id: newId('demoFeeTransaction'),
        userId: u.user.id,
        amount: 100,
        feeAmount: 10,
        netAmount: 90,
        tierLabel: 't',
        feeSchedule: '{}',
        idempotencyKey: 'k1234567',
      };
      await expect(
        ctx.db.insert(schema.demoFeeTransactions).values({ ...base, isDemo: 0 }),
      ).rejects.toThrow();
      await expect(
        ctx.db.insert(schema.demoFeeTransactions).values({
          ...base,
          id: newId('demoFeeTransaction'),
          idempotencyKey: 'k7654321',
          netAmount: 50,
        }),
      ).rejects.toThrow();
    });
  });
});

void (null as unknown as Err);
