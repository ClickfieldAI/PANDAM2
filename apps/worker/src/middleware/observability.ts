/**
 * Request id + one structured access-log line per request.
 *
 * Every response carries `X-Request-Id`, and every error body carries the same
 * id, so a user's "something went wrong" can be matched to the exact log line
 * and crash report. An incoming `X-Request-Id` is honoured only if it is a
 * short, plain token (so a caller cannot inject log-breaking text); otherwise
 * a fresh one is generated.
 */
import { createMiddleware } from 'hono/factory';

import { log } from '../lib/log';
import { type AppEnv } from '../types';

const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export const observability = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header('X-Request-Id');
  const requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);

  const startedAt = Date.now();
  await next();

  const status = c.res.status;
  log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'request', {
    requestId,
    method: c.req.method,
    // The matched pattern (`/api/v1/offers/:id`), not the URL: no ids, no query string.
    route: c.req.routePath,
    status,
    durationMs: Date.now() - startedAt,
    userId: c.get('auth')?.user.id ?? null,
  });
});
