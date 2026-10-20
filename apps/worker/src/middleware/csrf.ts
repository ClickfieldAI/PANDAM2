/**
 * Cross-site request forgery defence for cookie-authenticated writes.
 *
 * The web session cookie is `SameSite=None` (the app and the API are usually on
 * different origins), so a browser attaches it to requests started by ANY site.
 * CORS alone does not stop that for "simple" requests — a malicious page can
 * send a `text/plain` POST whose body is JSON, with the victim's cookie, and the
 * request still executes (the page just cannot read the answer).
 *
 * So: a state-changing request that authenticates by COOKIE must come from an
 * allowed origin. Browsers always send `Origin` on cross-site POST/PUT/PATCH/
 * DELETE, which makes this reliable. Requests that use a Bearer token (native
 * apps, scripts) are exempt — a token is not sent automatically, so it cannot
 * be forged cross-site — and a request with no `Origin` at all is a non-browser
 * client, which cannot be a CSRF vector.
 */
import { createMiddleware } from 'hono/factory';

import { SESSION_COOKIE } from '../lib/cookies';
import { ApiError } from '../lib/http';
import { type AppEnv } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(isAllowedOrigin: (origin: string, env: AppEnv['Bindings']) => boolean) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const usesBearer = (c.req.header('Authorization') ?? '').toLowerCase().startsWith('bearer ');
    const cookie = c.req.header('Cookie') ?? '';
    const usesSessionCookie = cookie
      .split(';')
      .some((p) => p.trim().startsWith(`${SESSION_COOKIE}=`));
    if (usesBearer || !usesSessionCookie) return next();

    const origin = c.req.header('Origin');
    if (origin && !isAllowedOrigin(origin, c.env)) {
      throw new ApiError('forbidden', 'This request came from an origin that is not allowed.');
    }
    return next();
  });
}
