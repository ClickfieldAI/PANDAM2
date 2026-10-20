# PANDAM

PANDAM is a direct **barter marketplace**: users list what they _have_, state
what they _need_, search listings, get rule-based matches, send barter offers,
chat, complete the exchange, and review each other. No money, no credits, no
wallet — a good is traded directly for a good.

> **Status: full V1 marketplace loop.** Built: the monorepo and build tooling;
> the full domain/database foundation; session auth plus Google/Apple sign-in;
> a one-time demo identity-verification onboarding step; the `@pandam/ui`
> design system and app navigation shell; I HAVE / I NEED, discovery, matches,
> and profile on real API data with real R2 image upload; the full
> request → offer → chat loop (an offer's conversation only opens once the
> recipient accepts — declining or cancelling leaves no chat at all) with
> accept/decline, barter transactions,
> reviews, notifications, and abuse reports/disputes; real-money purchase of a
> `sale`/`both` listing via Razorpay. Admin tools (roles, suspension, takedown, report review, read-only
> transaction inspection) exist. **Not** built: dispute resolution tooling, and the permanent V1 exclusions (AI matching, credits,
> currency beyond the optional Razorpay purchase path). See
> [`docs/architecture/overview.md`](docs/architecture/overview.md).
>
> This README describes what's on the current working branch; `docs/` may
> lag behind it in places (age of the codebase moves faster than the docs).

## Architecture

```
                    PANDAM
                       |
              +--------+--------+
              |                 |
           FRONTEND          BACKEND
              |                 |
      Expo / React Native   Cloudflare Workers
              |                 |
       iOS / Android / Web     Hono
                                |
                             Services
                                |
                             Drizzle
                                |
                                D1

Images:    App -> Worker -> R2
Realtime:  App -> Worker -> Durable Object -> WebSocket
Jobs:      Worker -> Queue -> Worker (consumer)
```

See [`docs/architecture/overview.md`](docs/architecture/overview.md) and
[`docs/decisions/0001-platform-architecture.md`](docs/decisions/0001-platform-architecture.md).

## Tech stack

| Layer                  | Choice                                                        |
| ---------------------- | ------------------------------------------------------------- |
| App                    | Expo, Expo Router, React Native, React Native Web, TypeScript |
| Styling                | NativeWind (Tailwind)                                         |
| Animation / gesture    | Reanimated, Gesture Handler                                   |
| Images                 | expo-image                                                    |
| Server state           | TanStack Query                                                |
| Client state           | Zustand                                                       |
| Forms / validation     | React Hook Form + Zod                                         |
| API                    | Cloudflare Workers + Hono                                     |
| Database               | Cloudflare D1 + Drizzle ORM                                   |
| Object storage         | Cloudflare R2                                                 |
| Realtime               | Cloudflare Durable Objects + WebSockets                       |
| Background jobs        | Cloudflare Queues                                             |
| Mobile builds          | EAS Build                                                     |
| Monitoring / analytics | Sentry, PostHog                                               |
| Monorepo               | pnpm workspaces + Turborepo                                   |

## Repository layout

```
apps/
  app/          Expo universal app (iOS / Android / Web)
                  app/(auth)         login / register (+ Google/Apple sign-in)
                  app/(onboarding)   one-time demo identity verification (new
                                     signups only; skipped once verified)
                  app/(app)/(tabs)   the app shell + auth guard
                  src/lib/api            fetch client + typed endpoint wrappers
                  src/lib/hooks          TanStack Query hooks (market, categories, matches)
                  src/lib/auth           useSession / login / register / logout / oauth.ts
                  src/lib/verification   pluggable identity-verification providers (demo
                                         today; production DigiLocker/face swap in later)
                  src/components         Splash + domain cards (ItemCard, MatchCard, ...)
  worker/       Cloudflare Worker API (Hono)
                  src/routes/api/v1     versioned API (auth, profiles, categories,
                                        listings, needs, matches, offers, conversations,
                                        transactions, reviews, notifications, reports,
                                        payments, verification, ...)
                  src/routes/api/v1/market.ts  one factory for listings + needs
                  src/middleware/auth.ts context + auth + requireAuth
                  src/domain            pure business rules (matching, lifecycles)
                  src/lib/crypto.ts     PBKDF2 password + session-token hashing
                  src/lib/oauth.ts      verifies Google/Apple ID tokens against their JWKS
packages/
  ui/           cross-platform design system: tokens + primitives (pure RN)
  types/        shared TypeScript types (derived from the DB schema)
  validation/   shared Zod schemas (auth, profile, listing, need, discovery, ...)
  database/     Drizzle schema + migrations + D1 client + repository layer
                  repositories/market.ts  discovery read model (public owner slice)
  config/       shared tsconfig / eslint / prettier
  utils/        framework-agnostic helpers
docs/
  architecture/ (overview.md, domain.md, auth.md, marketplace-ui.md)
  product/   api/   decisions/
scripts/        repo scripts
.github/workflows/  CI
```

## Prerequisites

- Node `^20.19.4 || ^22.13.0 || >=24.3.0` (see `.nvmrc`; required by React Native 0.86 / Expo SDK 57)
- pnpm `>= 9` (`npm i -g pnpm` or `corepack enable`)
- For native builds only: Xcode / Android Studio, plus an Expo account for EAS

## Setup

```bash
pnpm install
cp .env.example .env
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

## Development commands

Run from the repo root:

| Command                             | What it does                                             |
| ----------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                          | Runs every package's `dev` (Expo + Worker) via Turborepo |
| `pnpm dev:app`                      | Expo dev server only (web on port 3000)                  |
| `pnpm dev:worker`                   | `wrangler dev` only (port 8787)                          |
| `pnpm build`                        | Build all packages                                       |
| `pnpm lint`                         | ESLint across the monorepo                               |
| `pnpm typecheck`                    | `tsc --noEmit` across the monorepo                       |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                   |
| `pnpm test`                         | Run all package test suites                              |

### Expo (apps/app)

```bash
pnpm dev:app          # then press w / i / a
```

Web: http://localhost:3000

### Worker (apps/worker)

```bash
pnpm dev:worker
curl http://localhost:8787/health
# { "status": "ok", "service": "pandam-api", ... }
```

### D1 / Drizzle (packages/database)

```bash
pnpm --filter @pandam/database generate       # schema -> SQL migration
pnpm --filter @pandam/database migrate:local  # apply migrations to local D1
pnpm --filter @pandam/database seed:local     # load the category seed
```

Then `pnpm dev:worker` and, for example:

```bash
curl http://localhost:8787/api/v1/categories
curl -s -X POST http://localhost:8787/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"a@example.com","password":"a decent pw 1","displayName":"A"}'
# → { ok:true, data:{ user, profile, token, expiresAt } } + Set-Cookie
```

The **D1 `DB` binding and the R2 `MEDIA` binding are both enabled** in
`apps/worker/wrangler.jsonc` with placeholder ids, so `wrangler dev --local`
runs both against local emulation — a SQLite file and a folder under
`apps/worker/.wrangler/` — **no cloud resource, no Cloudflare account needed**
for local development. Durable Objects and Queues bindings remain
declared-but-commented (realtime chat and background jobs aren't built yet);
provision each with `wrangler` and uncomment its block when needed. Nothing
here creates cloud resources or deploys. See
[`docs/architecture/domain.md`](docs/architecture/domain.md) and
[`docs/architecture/auth.md`](docs/architecture/auth.md).

`migrate:local` applies **every** migration under `packages/database/migrations`
in order — run it again any time you pull new migration files, it's a no-op
for ones already applied.

### Demo data

Two separate things are both called "demo" here, don't confuse them:

- **`EXPO_PUBLIC_DEMO_DATA=1`** (in `apps/app/.env.local`) overlays a
  client-only showcase (fake ids like `demo-l-...`) on top of whatever the API
  actually returns. Fine for a quick visual look, but nothing in it is a real
  row — you can't send an offer on a `demo-` item, and real content merges in
  around it rather than being replaced.
- **`node scripts/seed-showcase.mjs [apiBaseUrl]`** creates that same showcase
  as REAL accounts, listings and requests through the live API (register,
  categories, listings, needs, image upload) — every item is a genuine
  server-side row, so the full request → offer → chat loop works on it. Run
  this against your local worker (`pnpm dev:worker` first) instead of turning
  on `EXPO_PUBLIC_DEMO_DATA`, and leave that flag at `0`/unset. Idempotent —
  safe to re-run. Showcase accounts sign in with the password the script
  prints (`Showcase2026x` at the time of writing).

### Social sign-in (Google / Apple)

Optional. Without any of the below set, the app still runs fine and the
Google/Apple buttons on login/register show a clear "not configured" message
instead of failing silently. To turn them on you need your **own** Google
Cloud / Apple Developer credentials — nobody else's client ids will work for
your build.

**Both providers are native modules and need a custom EAS development or
production build — neither appears, or works correctly, in plain Expo Go.**
On `web`, Google falls back to the `expo-auth-session` redirect flow (no
native module needed there); Apple has no web path at all.

1. **Google Cloud Console** (console.cloud.google.com → APIs & Services →
   Credentials → Create Credentials → OAuth client ID) — create two clients
   in the same project:
   - **Web application** — used two ways: the `web` platform's redirect
     flow, and as `webClientId` for the native iOS/Android SDK (Google signs
     the token returned on iOS/Android with this client as its `aud`, which
     is what the server then verifies against).
   - **iOS** — bundle id `com.pandam.app`. Used as `iosClientId` for the
     native SDK. Note its numeric client id; its reversed form
     (`com.googleusercontent.apps.<that id>`) is a **build-time** value that
     must be set as `iosUrlScheme` in `apps/app/app.json`'s
     `@react-native-google-signin/google-signin` plugin entry — changing it
     requires a new native build (`eas build` / `expo prebuild`), it cannot
     be swapped at runtime via env var like the other values here.
2. `apps/app/.env.local`: `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`,
   `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS` — not secret, embedded in the bundle.
3. `apps/worker/.dev.vars`: `GOOGLE_OAUTH_CLIENT_IDS` (comma-separated — both
   the Web and iOS client ids above, since the server has to accept an ID
   token minted for either), `APPLE_OAUTH_AUDIENCES` (your bundle id, plus a
   Services ID if you also want Apple sign-in on web).
4. Google sign-in replay protection: the native iOS SDK
   (`@react-native-google-signin/google-signin`) has no nonce parameter in
   its free tier, so the native flow sends none — the server falls back to
   verifying the token on signature + issuer + audience + expiry alone for
   that flow specifically. The `web` Google flow and all of Apple sign-in
   still use a nonce and the server still enforces it strictly for those.

See `apps/app/src/lib/auth/oauth.ts` and `apps/worker/src/lib/oauth.ts` for
exactly what each value verifies.

## Environment variables

Documented in [`.env.example`](.env.example) and
[`apps/worker/.dev.vars.example`](apps/worker/.dev.vars.example).
`EXPO_PUBLIC_*` values are embedded in the client bundle and are not secret
(`EXPO_PUBLIC_API_URL` points the app at the Worker; `EXPO_PUBLIC_DEMO_DATA`
toggles the client-only showcase overlay — see **Demo data** above). Worker
vars/secrets go in `apps/worker/.dev.vars` locally (gitignored) and
`wrangler secret put` in deployed environments. Auth needs **no secret
locally** — password and token hashing use the runtime's Web Crypto.
`CORS_ORIGINS` (comma-separated) extends the credentialed-CORS allowlist beyond
the built-in `localhost` dev origins. Razorpay, Sentry, PostHog and Expo push
are all optional and degrade to a clear "not configured" state without keys.
No real secrets live in this repo.
