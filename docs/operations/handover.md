# Handover

For the next person (or you in six months). Read this first, then `DEVELOPMENT_AUDIT.md` for the evidence behind every status claim.

## What PANDAM is

A barter marketplace: list what you have, say what you need, get matched, offer, counter, chat, confirm the exchange, review. Optional real-money purchase of `sale` listings via Razorpay is a separate path. The `Platform fee` screen is a **demo** (simulated sales, no money).

## Repository map

```
apps/app        Expo (React Native + web) client: screens in app/, logic in src/
apps/worker     Cloudflare Worker API (Hono): routes, services, domain rules, middleware
packages/database   D1 schema (Drizzle), migrations 0000–0019, repositories, seed
packages/types      Shared API shapes     packages/validation  Shared Zod schemas
packages/ui         Design system         packages/utils, config  Small helpers / tooling
docs/           architecture/, decisions/, operations/, testing/
e2e/maestro     Device flows (never run)
DEVELOPMENT_AUDIT.md / DEVELOPMENT_ROADMAP.md   Status of every feature, with evidence
```

Where rules live: HTTP in `apps/worker/src/routes/api/v1`, business rules in `services/` and `domain/` (pure, unit-tested), SQL in `packages/database/src/repositories`. Read `docs/architecture/barter-engine.md`, `security-and-operations.md` and `admin.md` before changing trades, middleware or staff tools.

## Run it locally

```bash
pnpm install
cd apps/worker
cp .dev.vars.example .dev.vars                        # optional values only; auth needs none
pnpm exec wrangler d1 migrations apply pandam-db --local
pnpm --filter @pandam/database seed:local             # categories
pnpm dev:worker                                       # API on http://localhost:8787
pnpm dev:app                                          # Expo; for a phone set EXPO_PUBLIC_API_URL to http://<your-LAN-ip>:8787
```

Local data lives under `apps/worker/.wrangler/` (gitignored). Delete that folder for a clean slate.

## Daily commands

| Task               | Command                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything CI runs | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`                                                                                                                            |
| Fix formatting     | `pnpm exec prettier --write <files>` (avoid repo-wide `format`: it rewrites `wrangler.jsonc`)                                                                                                            |
| New migration      | edit the schema in `packages/database/src/schema`, then `cd packages/database && pnpm exec drizzle-kit generate --name <name>`; keep it additive; extend `apps/worker/test/migrations-populated.test.ts` |
| Make an admin      | SQL in `docs/operations/deployment.md` §5                                                                                                                                                                |

## Rules the code depends on (do not break casually)

1. **Identity comes only from the session.** Never read a user id from a body or query. `security.test.ts` sweeps every route for authentication against an explicit public allowlist.
2. **D1 has no interactive transactions.** Multi-step changes are single compare-and-swap statements, `runBatch`, unique indexes and idempotent follow-ups. Do not introduce read-then-write logic without one of those.
3. **The client trusts only server answers.** Success messages and animations fire from `onSuccess`; chat uses a client id so retries cannot duplicate.
4. **Honest copy.** Do not promise review, delivery or protection the system does not provide (report/dispute screens, "Seen" vs "delivered").
5. **No secrets in the repo**, and demo features stay disabled when `PANDAM_ENV=production`.

## State of the work (see audit §7–§14 for evidence)

Done and tested in code: barter engine with counters and history, favourites, listing deletion, blocking and reports, chat reliability (outbox, replay-safe sends), rate limiting, request ids and logging, crash reporting (unconnected), security regression suite, admin (roles, suspension, takedown, report review, transaction inspection, audit log), confirmation animation, backup/restore and deployment runbooks.

**Not verified anywhere real:** physical devices, Cloudflare D1 under concurrency, a live Sentry project, Razorpay, Expo push delivery, Maestro flows, Lottie playback on a phone, the admin screens in a browser or phone.

**Not built / blocked:** a production identity-verification provider (production onboarding cannot complete without it), email verification and password reset, real-time chat sockets, search filters for price/availability, a scheduled sweep for expired offers, N+1 reduction in list hydration, staff 2FA, an appeals flow, dispute _resolution_ tooling (staff can read disputes, not settle them).

## First things to do before a public launch

1. Integrate a real identity provider (or decide to remove the step), then re-test onboarding with `PANDAM_ENV=production`.
2. Run `docs/testing/device-checklist.md` on at least one iPhone and one Android phone.
3. Provision Cloudflare per `docs/operations/deployment.md`, run a restore drill per `docs/operations/backup-restore.md`.
4. Add password reset and email verification, or consciously accept the support burden.
5. Replace the estimated rate-limit thresholds with numbers from real traffic.
