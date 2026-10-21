#!/usr/bin/env node
/**
 * Seed the marketplace SHOWCASE as real data, through the real API.
 *
 *   node scripts/seed-showcase.mjs [apiBaseUrl]   (default http://localhost:8787)
 *
 * Why: the app's demo mode (EXPO_PUBLIC_DEMO_DATA=1) only overlays sample
 * items in the client. Those items have no server rows, so nobody can send an
 * offer on them, chat about them, or be notified — the whole trade loop fails
 * on exactly the items a demo shows first. This script turns that same
 * showcase (apps/app/src/dummy/data.ts) into real accounts, listings and
 * requests, so the app can run with demo mode OFF and every flow is real.
 *
 * Every write goes through the public API (register, profile, verification,
 * categories, listings, needs, image upload) — no direct database access, so
 * all validation and ownership rules apply. Safe to re-run: existing accounts
 * sign in instead of registering, and an owner's existing items (same title)
 * are skipped.
 *
 * Local/dev only: it uses the demo verification endpoint, which the Worker
 * refuses in production.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.argv[2] ?? 'http://localhost:8787').replace(/\/$/, '') + '/api/v1';
const PASSWORD = 'Showcase2026x';

/* ---------------------------------------------------------- load showcase -- */
const tmp = mkdtempSync(join(tmpdir(), 'pandam-seed-'));
const out = join(tmp, 'data.cjs');
execFileSync(
  process.execPath,
  [
    join(ROOT, 'node_modules/esbuild/bin/esbuild'),
    join(ROOT, 'apps/app/src/dummy/data.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--packages=external',
    `--outfile=${out}`,
    '--log-level=error',
  ],
  { stdio: 'inherit' },
);
const data = createRequire(import.meta.url)(out);
rmSync(tmp, { recursive: true, force: true });

const meId = data.demoMyListings[0]?.ownerId;
const items = [...data.demoListings, ...data.demoNeeds].filter((i) => i.ownerId !== meId);
const owners = new Map(items.map((i) => [i.ownerId, i.owner]));

/* ------------------------------------------------------------------- http -- */
async function call(method, path, { token, body, form } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : form,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  return new File([await res.arrayBuffer()], type.includes('png') ? 'photo.png' : 'photo.jpg', {
    type,
  });
}

async function uploadImage(path, token, url) {
  try {
    const form = new FormData();
    form.append('file', await download(url));
    const r = await call('POST', path, { token, form });
    return r.status < 300;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- accounts -- */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');

async function account(owner) {
  const email = `showcase.${slug(owner.username ?? owner.displayName)}@pandam.local`;
  let r = await call('POST', '/auth/register', {
    body: { email, password: PASSWORD, displayName: owner.displayName },
  });
  if (r.status === 409)
    r = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (r.status >= 300) throw new Error(`account ${email}: ${JSON.stringify(r.json.error)}`);
  const token = r.json.data.token;

  await call('PATCH', '/profiles/me', {
    token,
    body: { locationCity: owner.locationCity ?? null, username: owner.username ?? null },
  });
  if (owner.avatarUrl && !r.json.data.profile?.avatarUrl) {
    await uploadImage('/profiles/me/avatar', token, owner.avatarUrl);
  }
  await call('POST', '/verification/government-id', { token, body: { mode: 'demo' } });
  await call('POST', '/verification/face', { token, body: { mode: 'demo' } });
  return { token, userId: r.json.data.user.id, email };
}

/* ------------------------------------------------------------- categories -- */
async function categoryIds(token) {
  const list = (await call('GET', '/categories')).json.data.categories;
  const bySlug = new Map(list.map((c) => [c.slug, c.id]));
  const byName = new Map(list.map((c) => [c.name.toLowerCase(), c.id]));
  return async (cat) => {
    const hit = bySlug.get(cat.slug) ?? byName.get(cat.name.toLowerCase());
    if (hit) return hit;
    const r = await call('POST', '/categories', { token, body: { name: cat.name } });
    const id = r.json.data?.category?.id ?? r.json.error?.details?.existingId?.[0];
    if (!id) throw new Error(`category ${cat.name}: ${JSON.stringify(r.json.error)}`);
    bySlug.set(cat.slug, id);
    return id;
  };
}

/* ------------------------------------------------------------------- main -- */
const accounts = new Map();
for (const [id, owner] of owners) {
  accounts.set(id, await account(owner));
  console.log(`account   ${owner.displayName}`);
}
const resolveCategory = await categoryIds([...accounts.values()][0].token);

let created = 0;
let skipped = 0;
for (const item of items) {
  const { token, userId } = accounts.get(item.ownerId);
  const kind = item.kind === 'listing' ? 'listings' : 'needs';
  const existing = (await call('GET', `/${kind}?owner=${userId}&limit=100`)).json.data?.items ?? [];
  if (existing.some((e) => e.title === item.title)) {
    skipped++;
    continue;
  }
  const body = {
    categoryId: await resolveCategory(item.category),
    type: item.type,
    title: item.title,
    description: item.description,
    status: 'published',
    // Listings and requests require a poster's mobile number (a fake demo one here).
    phone: '+919000000000',
    ...(item.kind === 'listing' && item.pricing
      ? {
          transactionType: item.pricing.transactionType,
          ...(item.pricing.priceAmount != null
            ? { priceAmount: item.pricing.priceAmount, priceCurrency: item.pricing.priceCurrency }
            : {}),
        }
      : {}),
  };
  const r = await call('POST', `/${kind}`, { token, body });
  if (r.status >= 300) {
    console.warn(`FAILED    ${item.title}: ${JSON.stringify(r.json.error)}`);
    continue;
  }
  const newId = r.json.data.item.id;
  let photo = '';
  if (item.kind === 'listing' && item.images?.[0]?.url) {
    photo = (await uploadImage(`/listings/${newId}/images`, token, item.images[0].url))
      ? ' +photo'
      : ' (photo failed)';
  }
  created++;
  console.log(`${item.kind.padEnd(9)} ${item.title}${photo}`);
}

console.log(
  `\nDone: ${accounts.size} accounts, ${created} items created, ${skipped} already existed.`,
);
console.log(`Showcase accounts sign in with password: ${PASSWORD}`);
