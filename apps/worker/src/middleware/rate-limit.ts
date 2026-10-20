/**
 * Rate limiting for the API's abuse-prone writes.
 *
 * Counters live in D1 (`rate_limits`) and are bumped by one atomic upsert, so
 * the limit holds across Worker isolates without a Durable Object. Windows are
 * fixed (a caller can burst up to ~2× the limit across a boundary) — simple
 * and cheap, which is the right trade for abuse protection rather than billing.
 *
 * Who is limited: a signed-in caller by user id; an anonymous one by the IP
 * Cloudflare reports in `CF-Connecting-IP` (set by the edge and not
 * client-controllable; `X-Forwarded-For` is deliberately ignored). When no IP
 * is available (local dev, tests) IP-keyed policies are skipped rather than
 * lumping everyone together.
 *
 * Failure policy: if the counter store errors, the request is ALLOWED and the
 * error is logged. An outage of the limiter must not become an outage of the
 * API.
 */
import { type Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import { ApiError } from '../lib/http';
import { describeError, log } from '../lib/log';
import { createAuthService } from '../services/auth';
import { type AppEnv } from '../types';

import { extractToken } from './auth';

export interface Policy {
  name: string;
  method: string;
  /** Matched against the path after `/api/v1`. */
  path: RegExp;
  limit: number;
  windowSec: number;
  by: 'user' | 'ip';
}

/**
 * The whole policy table, in one auditable place. Reads are not limited; these
 * are the endpoints where abuse (credential stuffing, spam, scraping via
 * writes, storage abuse) actually costs something. Limits are set well above
 * what a real person does in the window.
 */
export const POLICIES: readonly Policy[] = [
  {
    name: 'admin.write',
    method: 'POST',
    path: /^\/admin\//,
    limit: 120,
    windowSec: 600,
    by: 'user',
  },
  {
    name: 'admin.read',
    method: 'GET',
    path: /^\/admin\//,
    limit: 600,
    windowSec: 600,
    by: 'user',
  },
  {
    name: 'auth.register',
    method: 'POST',
    path: /^\/auth\/register$/,
    limit: 20,
    windowSec: 3600,
    by: 'ip',
  },
  {
    name: 'auth.login',
    method: 'POST',
    path: /^\/auth\/login$/,
    limit: 20,
    windowSec: 600,
    by: 'ip',
  },
  {
    name: 'auth.oauth',
    method: 'POST',
    path: /^\/auth\/oauth$/,
    limit: 30,
    windowSec: 600,
    by: 'ip',
  },
  {
    name: 'account.password',
    method: 'POST',
    path: /^\/users\/me\/change-password$/,
    limit: 5,
    windowSec: 900,
    by: 'user',
  },
  {
    name: 'account.delete',
    method: 'DELETE',
    path: /^\/users\/me$/,
    limit: 3,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'offers.create',
    method: 'POST',
    path: /^\/offers$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'offers.counter',
    method: 'POST',
    path: /^\/offers\/[^/]+\/counter$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'offers.respond',
    method: 'POST',
    path: /^\/offers\/[^/]+\/respond$/,
    limit: 60,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'messages.send',
    method: 'POST',
    path: /^\/conversations\/[^/]+\/messages$/,
    limit: 60,
    windowSec: 60,
    by: 'user',
  },
  {
    name: 'uploads',
    method: 'POST',
    path: /^\/(?:listings\/[^/]+\/images|needs\/[^/]+\/images|offers\/attachments|conversations\/[^/]+\/attachments|profiles\/me\/avatar)$/,
    limit: 30,
    windowSec: 600,
    by: 'user',
  },
  {
    name: 'items.create',
    method: 'POST',
    path: /^\/(?:listings|needs)$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'items.delete',
    method: 'DELETE',
    path: /^\/(?:listings|needs)\/[^/]+$/,
    limit: 60,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'reports.create',
    method: 'POST',
    path: /^\/reports(?:\/disputes)?$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'blocks.change',
    method: 'PUT',
    path: /^\/blocks\/[^/]+$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'favourites.change',
    method: 'PUT',
    path: /^\/favourites\/[^/]+$/,
    limit: 200,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'transactions.status',
    method: 'POST',
    path: /^\/transactions\/[^/]+\/status$/,
    limit: 60,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'reviews.create',
    method: 'POST',
    path: /^\/reviews$/,
    limit: 30,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'payments.create',
    method: 'POST',
    path: /^\/payments$/,
    limit: 20,
    windowSec: 3600,
    by: 'user',
  },
  {
    name: 'demo-fees.confirm',
    method: 'POST',
    path: /^\/demo-fees\/confirm$/,
    limit: 60,
    windowSec: 3600,
    by: 'user',
  },
];

export function matchPolicy(method: string, apiPath: string): Policy | null {
  return POLICIES.find((p) => p.method === method && p.path.test(apiPath)) ?? null;
}

export interface Verdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window ends. */
  retryAfterSec: number;
}

/**
 * Count one hit against `key` for the given policy numbers. Exposed so routes
 * can add a second, finer limit (e.g. login attempts per email).
 */
export async function consume(
  c: Context<AppEnv>,
  key: string,
  limit: number,
  windowSec: number,
  now = Date.now(),
): Promise<Verdict> {
  const windowMs = windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  try {
    const { repos } = c.get('ctx');
    const count = await repos.rateLimits.hit(key, windowStart);
    // ~1% of calls tidy up windows that ended over an hour ago.
    if (Math.random() < 0.01) void repos.rateLimits.prune(now - 3_600_000).catch(() => undefined);
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch (error) {
    log('error', 'rate limiter unavailable — allowing request', {
      key: key.split(':')[0],
      ...describeError(error),
    });
    return { allowed: true, limit, remaining: limit, retryAfterSec };
  }
}

/**
 * Is this key already over its limit? Does NOT count a hit. Used for limits
 * that should only count FAILURES (e.g. wrong passwords), so a real person
 * who signs in successfully is never penalised.
 */
export async function isOverLimit(
  c: Context<AppEnv>,
  key: string,
  limit: number,
  windowSec: number,
  now = Date.now(),
): Promise<Verdict> {
  const windowMs = windowSec * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  try {
    const count = await c.get('ctx').repos.rateLimits.count(key, windowStart);
    return { allowed: count < limit, limit, remaining: Math.max(0, limit - count), retryAfterSec };
  } catch (error) {
    log('error', 'rate limiter unavailable — allowing request', { ...describeError(error) });
    return { allowed: true, limit, remaining: limit, retryAfterSec };
  }
}

function tooMany(c: Context<AppEnv>, v: Verdict): never {
  c.header('Retry-After', String(v.retryAfterSec));
  throw new ApiError(
    'too_many_requests',
    `Too many requests. Please try again in ${v.retryAfterSec} seconds.`,
  );
}

/** Enforce a verdict, or throw 429 with `Retry-After`. */
export function enforce(c: Context<AppEnv>, v: Verdict): void {
  if (!v.allowed) tooMany(c, v);
}

/** The caller's IP as reported by Cloudflare, or null when unavailable. */
export function clientIp(c: Context<AppEnv>): string | null {
  const ip = c.req.header('CF-Connecting-IP')?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/**
 * Applies the policy table to `/api/v1` requests. Mounted after the request
 * context is built. Identity is the signed-in user when there is a valid
 * session, else the IP.
 */
export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const apiPath = c.req.path.replace(/^\/api\/v1/, '');
  const policy = matchPolicy(c.req.method, apiPath);
  if (!policy) return next();

  let identity: string | null = null;
  if (policy.by === 'user') {
    const token = extractToken(c);
    const auth = token ? await createAuthService(c.get('ctx').repos).authenticate(token) : null;
    // Not signed in: the route will answer 401 itself; fall back to the IP so
    // an unauthenticated flood is still bounded.
    identity = auth ? `u:${auth.user.id}` : clientIp(c) ? `ip:${clientIp(c)}` : null;
  } else {
    identity = clientIp(c) ? `ip:${clientIp(c)}` : null;
  }
  if (!identity) return next(); // nothing reliable to key on (local dev / tests)

  const verdict = await consume(c, `${policy.name}:${identity}`, policy.limit, policy.windowSec);
  c.header('RateLimit-Limit', String(verdict.limit));
  c.header('RateLimit-Remaining', String(verdict.remaining));
  c.header('RateLimit-Reset', String(verdict.retryAfterSec));
  enforce(c, verdict);
  return next();
});
