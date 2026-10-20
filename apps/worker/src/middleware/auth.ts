/**
 * Request-scoped middleware:
 *
 *  - `contextMiddleware(deps)` builds the DB-backed `RequestContext` once and
 *    puts it on `c.set('ctx')`.
 *  - `authMiddleware` resolves the session (cookie or bearer token) and puts
 *    `{ user, session } | null` on `c.set('auth')`. It never rejects — routes
 *    that need a user add `requireAuth`.
 *  - `requireAuth` rejects with `401 unauthorized` when there is no session.
 *
 * Identity is ALWAYS taken from the verified session here — route handlers must
 * never read a user id from the request body or query.
 */
import { type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';

import { type AppDeps, buildContext } from '../context';
import { SESSION_COOKIE } from '../lib/cookies';
import { ApiError } from '../lib/http';
import { type AuthenticatedContext, createAuthService } from '../services/auth';
import { type AppEnv } from '../types';

export function contextMiddleware(deps: AppDeps = {}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('ctx', buildContext(c, deps));
    await next();
  });
}

export function extractToken(c: Context<AppEnv>): string | null {
  const header = c.req.header('Authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() || null;
  }
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractToken(c);
  let auth: AuthenticatedContext | null = null;
  if (token) {
    const service = createAuthService(c.get('ctx').repos);
    auth = await service.authenticate(token);
  }
  c.set('auth', auth);
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('auth')) {
    throw new ApiError('unauthorized', 'Authentication is required for this route.');
  }
  await next();
});

/** Read the authenticated context, asserting a route ran `requireAuth`. */
export function getAuth(c: Context<AppEnv>): AuthenticatedContext {
  const auth = c.get('auth');
  if (!auth) throw new ApiError('unauthorized', 'Authentication is required for this route.');
  return auth;
}
