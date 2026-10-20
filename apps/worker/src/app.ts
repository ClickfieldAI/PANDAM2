import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import { type AppDeps } from './context';
import { ApiError, sendError } from './lib/http';
import { describeError, log } from './lib/log';
import { reportError } from './lib/monitoring';
import { csrfGuard } from './middleware/csrf';
import { observability } from './middleware/observability';
import { createApiV1 } from './routes/api/v1';
import { health } from './routes/health';
import { type AppEnv } from './types';

/** Origins always allowed to send credentialed requests in development. */
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006'];

/**
 * In development the web bundler's port moves (3000 taken → 3001), and testing
 * on a phone serves the app from the machine's LAN address. Pinning three
 * localhost ports makes those ordinary cases look like an auth bug, so dev
 * accepts any loopback or private-network origin. Deployed environments never
 * take this path — they use the explicit `CORS_ORIGINS` allowlist only.
 */
const DEV_ORIGIN_PATTERN =
  /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/**
 * The origins allowed to make credentialed requests. Deployed environments use
 * ONLY the explicit `CORS_ORIGINS` allowlist; the localhost conveniences exist
 * in development alone (a localhost page on a victim's machine must never be
 * able to call a production API with their cookie).
 */
export function isOriginAllowed(origin: string, env: AppEnv['Bindings']): boolean {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return true;
  const isDev = env.PANDAM_ENV === 'development';
  return isDev && (DEV_ORIGINS.includes(origin) || DEV_ORIGIN_PATTERN.test(origin));
}

/** JSON bodies are small by nature; uploads (multipart) have their own 8 MB cap. */
const MAX_JSON_BYTES = 100 * 1024;

/**
 * The PANDAM API application. A pure Hono app (no `fetch` export) so tests call
 * `app.request(...)` with no network. `createApp({ db })` injects a database in
 * tests; production builds one from `env.DB`.
 *
 * Structure:
 *   GET  /             service banner
 *   GET  /health       liveness
 *   /api/v1/*          versioned API (see routes/api/v1)
 *
 * Every response body is a `@pandam/types` envelope. `onError` maps a thrown
 * `ApiError` to its status + envelope and anything else to a generic
 * `internal_error` — internals are never leaked to the client. CORS is an
 * explicit allowlist with credentials enabled (never `*`, which cannot be
 * combined with cookies).
 */
export function createApp(deps: AppDeps = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', observability);
  /**
   * Security headers, with ONE exception.
   *
   * Uploaded images are served to the app from a different origin (the app on
   * :3000 or its own domain, the API on another), and the default
   * `Cross-Origin-Resource-Policy: same-origin` makes the browser refuse to
   * render them in an `<img>` at all. `/api/v1/media/*` therefore gets
   * `cross-origin` — these are already-public listing photos and avatars, and
   * every other route keeps the stricter default.
   *
   * It has to be chosen here rather than patched afterwards: `secureHeaders`
   * writes its headers on the way back out, so a later middleware setting
   * `Cross-Origin-Resource-Policy` would simply be overwritten.
   */
  const defaultHeaders = secureHeaders();
  const mediaHeaders = secureHeaders({ crossOriginResourcePolicy: 'cross-origin' });
  app.use('*', (c, next) =>
    c.req.path.startsWith('/api/v1/media/') ? mediaHeaders(c, next) : defaultHeaders(c, next),
  );
  app.use('*', (c, next) =>
    cors({
      origin: (origin) => (isOriginAllowed(origin, c.env) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining'],
    })(c, next),
  );
  // Cookie-authenticated writes must come from an allowed origin (CSRF).
  app.use('/api/v1/*', csrfGuard(isOriginAllowed));
  // Oversized JSON is refused before it is read.
  app.use('/api/v1/*', async (c, next) => {
    if ((c.req.header('Content-Type') ?? '').includes('application/json')) {
      return bodyLimit({
        maxSize: MAX_JSON_BYTES,
        onError: (ctx) => sendError(ctx, 'payload_too_large', 'That request body is too large.'),
      })(c, next);
    }
    return next();
  });

  app.get('/', (c) => c.json({ ok: true, data: { service: 'pandam-api', docs: '/api/v1' } }));
  app.route('/', health);
  app.route('/api/v1', createApiV1(deps));

  app.notFound((c) => sendError(c, 'not_found', 'Not found'));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return sendError(c, err.code, err.message, err.details);
    }
    // An unexpected failure: log it structurally, report it, and answer with a
    // generic message — internals never reach the client.
    const requestId = c.get('requestId');
    log('error', 'unhandled error', {
      requestId,
      method: c.req.method,
      route: c.req.routePath,
      ...describeError(err),
    });
    reportError(
      {
        error: err,
        requestId,
        method: c.req.method,
        route: c.req.routePath,
        userId: c.get('auth')?.user.id ?? null,
        environment: c.env?.PANDAM_ENV ?? 'unknown',
        release: c.env?.RELEASE,
      },
      {
        dsn: c.env?.SENTRY_DSN,
        waitUntil: (() => {
          try {
            return c.executionCtx.waitUntil.bind(c.executionCtx);
          } catch {
            return undefined; // no execution context (tests)
          }
        })(),
      },
    );
    return sendError(c, 'internal_error', 'Internal server error');
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
