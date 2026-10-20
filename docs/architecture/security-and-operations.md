# Security and operations

## Rate limiting

- Policy table: `apps/worker/src/middleware/rate-limit.ts` (`POLICIES`). One row per limited endpoint: name, method, path, limit, window, and whether it is keyed by **user** or **IP**. Add a row to limit a new endpoint; the test `rate limiting: policy table` guards against ambiguous patterns.
- Storage: D1 table `rate_limits` (atomic upsert per request, pruned opportunistically). No Durable Object is needed.
- Identity: signed-in user id, else `CF-Connecting-IP`. `X-Forwarded-For` is never trusted. With no IP (local dev), IP-keyed policies are skipped.
- Sign-in: 20 attempts / 10 min per IP, plus 8 **failed** attempts / 15 min per account + IP.
- Responses: `429`, error code `too_many_requests`, `Retry-After`, `RateLimit-Limit|Remaining|Reset`.
- Failure mode: if the counter store errors the request is allowed and an error is logged (`rate limiter unavailable`). Alert on that log line.
- Tuning: thresholds are estimates. After launch, review the `429` rate in logs and adjust the table.

## Request ids and logs

- Every response has `X-Request-Id`; every error body has `error.requestId`. Ask a user for it.
- Logs are one JSON object per line: `level, msg, time, requestId, method, route, status, durationMs, userId`. `route` is the pattern (`/api/v1/offers/:id`), never the URL. Secrets/emails are redacted (`lib/log.ts`).
- In Cloudflare: `wrangler tail`, or the dashboard's Workers Logs (observability is enabled in `wrangler.jsonc`). Filter on `requestId`.

## Crash reporting (Sentry)

- Set the secret once per environment: `wrangler secret put SENTRY_DSN` (local: `apps/worker/.dev.vars`). Optional `RELEASE` var, e.g. the git sha. With no DSN, reporting is off.
- Only unexpected 5xx errors are reported (not 4xx). The report holds error type, scrubbed message/stack, route pattern, request id, environment, release, user id — see `lib/monitoring.ts`.
- The request id on the report equals the id the user saw.

## CSRF and CORS

- Cookie-authenticated writes must carry an allowed `Origin` (`middleware/csrf.ts`). Bearer-token clients are exempt.
- Production CORS = `CORS_ORIGINS` only. Local origins are allowed only when `PANDAM_ENV=development`.
- Set `CORS_ORIGINS` (comma-separated) in the deployment config; leaving it empty means no browser origin can call the API with credentials.

## Tests that guard this

`test/security.test.ts` (route-authentication sweep with an explicit public allowlist, cross-user access, CORS, CSRF, cookies, injection, body size, error leakage, credential storage) and `test/hardening.test.ts` (rate limits, request ids, logging, crash reporting). When adding a route, decide whether it is public; if so add it to `PUBLIC` in the security test with the reason.
