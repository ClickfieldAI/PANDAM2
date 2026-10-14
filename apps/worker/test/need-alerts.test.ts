/**
 * Need alerts: publishing an I NEED request tells people who have a matching,
 * tradeable listing — once each, never the author, never sale-only owners.
 */
import { newId, schema } from '@pandam/database';
import { type AuthSession, type MarketItem, type NotificationView } from '@pandam/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_NEED_ALERTS, selectNeedAlertRecipients } from '../src/domain/need-alerts';

import { makeTestDb, testEnv, type TestDb } from './helpers/db';

describe('selectNeedAlertRecipients', () => {
  const need = { id: 'n1', ownerId: 'author', categoryId: 'tech', type: 'product' as const };
  const listing = (ownerId: string, over: Record<string, unknown> = {}) => ({
    ownerId,
    categoryId: 'tech',
    type: 'product' as const,
    transactionType: 'barter' as const,
    ...over,
  });

  it('alerts owners of a same category+type listing, once each', () => {
    const got = selectNeedAlertRecipients(need, [listing('a'), listing('a'), listing('b')]);
    expect(got).toEqual(['a', 'b']);
  });

  it('skips the author, other categories, other types and sale-only listings', () => {
    const got = selectNeedAlertRecipients(need, [
      listing('author'),
      listing('x', { categoryId: 'design' }),
      listing('y', { type: 'service' }),
      listing('z', { transactionType: 'sale' }),
      listing('ok', { transactionType: 'both' }),
    ]);
    expect(got).toEqual(['ok']);
  });

  it('caps the fan-out', () => {
    const many = Array.from({ length: MAX_NEED_ALERTS + 10 }, (_, i) => listing(`u${i}`));
    expect(selectNeedAlertRecipients(need, many)).toHaveLength(MAX_NEED_ALERTS);
  });
});

let ctx: TestDb;
let tech = '';
let design = '';
beforeEach(async () => {
  ctx = await makeTestDb();
  tech = newId('category');
  design = newId('category');
  await ctx.db.insert(schema.categories).values([
    { id: tech, name: 'Technology', slug: 'technology' },
    { id: design, name: 'Design', slug: 'design' },
  ]);
});
afterEach(() => ctx.close());

type Ok<T> = { ok: true; data: T };
type App = ReturnType<TestDb['makeApp']>;
const json = <T>(r: Response) => r.json() as Promise<T>;
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function newUser(app: App, name: string): Promise<AuthSession> {
  const res = await app.request(
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
    testEnv,
  );
  return (await json<Ok<AuthSession>>(res)).data;
}

const post = (app: App, token: string, path: string, body: unknown) =>
  app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(token) },
      body: JSON.stringify(body),
    },
    testEnv,
  );

async function item(
  app: App,
  token: string,
  kind: 'listings' | 'needs',
  title: string,
  over: Record<string, unknown> = {},
) {
  const res = await post(app, token, `/api/v1/${kind}`, {
    categoryId: tech,
    type: 'product',
    title,
    description: 'A description that is long enough to pass.',
    status: 'published',
    ...over,
  });
  expect(res.status).toBe(201);
  return (await json<Ok<{ item: MarketItem }>>(res)).data.item;
}

async function alertsFor(app: App, token: string): Promise<NotificationView[]> {
  const res = await app.request('/api/v1/notifications', { headers: bearer(token) }, testEnv);
  const body = await json<Ok<{ items: NotificationView[] }>>(res);
  return body.data.items.filter((n) => n.type === 'need_match');
}

describe('POST /api/v1/needs alerts', () => {
  it('alerts a matching listing owner but not the author or non-matching owners', async () => {
    const app = ctx.makeApp();
    const author = await newUser(app, 'author');
    const owner = await newUser(app, 'owner');
    const wrongCat = await newUser(app, 'wrongcat');
    const saleOnly = await newUser(app, 'saleonly');
    await item(app, owner.token, 'listings', 'Laptop', { transactionType: 'barter' });
    await item(app, author.token, 'listings', 'Authors own', { transactionType: 'barter' });
    await item(app, wrongCat.token, 'listings', 'Logo', { categoryId: design });
    await item(app, saleOnly.token, 'listings', 'For sale', {
      transactionType: 'sale',
      priceAmount: 5000,
      priceCurrency: 'INR',
    });

    const need = await item(app, author.token, 'needs', 'Need a laptop');

    const got = await alertsFor(app, owner.token);
    expect(got).toHaveLength(1);
    expect(got[0]?.data).toMatchObject({ needId: need.id });
    expect(await alertsFor(app, author.token)).toHaveLength(0);
    expect(await alertsFor(app, wrongCat.token)).toHaveLength(0);
    expect(await alertsFor(app, saleOnly.token)).toHaveLength(0);
  });

  it('does not alert for a draft, alerts when it is published, and never twice', async () => {
    const app = ctx.makeApp();
    const author = await newUser(app, 'author');
    const owner = await newUser(app, 'owner');
    await item(app, owner.token, 'listings', 'Laptop');

    const need = await item(app, author.token, 'needs', 'Need a laptop', { status: 'draft' });
    expect(await alertsFor(app, owner.token)).toHaveLength(0);

    await post(app, author.token, `/api/v1/needs/${need.id}/status`, { status: 'published' });
    expect(await alertsFor(app, owner.token)).toHaveLength(1);

    await post(app, author.token, `/api/v1/needs/${need.id}/status`, { status: 'paused' });
    await post(app, author.token, `/api/v1/needs/${need.id}/status`, { status: 'published' });
    expect(await alertsFor(app, owner.token)).toHaveLength(1);
  });
});
