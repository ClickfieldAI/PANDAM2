# Deployment guide

Nothing in this repository deploys itself, and nothing here has been deployed. Every step below is an instruction for **you** to run with your own Cloudflare and Expo accounts. Commands marked _unverified_ were not run against real Cloudflare/Expo services.

## 0. What a release is

1. **API**: the Cloudflare Worker in `apps/worker` (+ D1 database + R2 bucket).
2. **App**: the Expo app in `apps/app`, built with EAS for iOS/Android (and optionally exported for web).

The API is deployed first; the app only needs the API's URL.

## 1. Gate: CI must be green

`.github/workflows/ci.yml` runs on every push: install (frozen lockfile), format check, lint, typecheck, tests, build. Do not release from a red commit. Locally the same sequence is:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 2. One-time Cloudflare setup (_unverified_)

```bash
cd apps/worker
pnpm exec wrangler login
pnpm exec wrangler d1 create pandam-db          # copy the database_id into wrangler.jsonc
pnpm exec wrangler r2 bucket create pandam-media
```

Edit `apps/worker/wrangler.jsonc`:

- `d1_databases[0].database_id` — the real id (it is a placeholder today).
- `vars.PANDAM_ENV` — `"production"` for the production Worker. **This matters:** in `production` the demo platform-fee routes are refused, demo identity verification is refused, and localhost is not an allowed CORS origin. In `development` all three are open.
- Use `wrangler deploy --env <name>` once you add named environments (preview vs production); the file intentionally has none yet.

## 3. Secrets and variables

Set secrets with `pnpm exec wrangler secret put NAME` (never commit them; `.dev.vars` is for local use only and is gitignored).

| Name                                               | Needed for                                                       | If missing                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `CORS_ORIGINS`                                     | Browser origins allowed to call the API (comma-separated, exact) | Web clients are blocked; native apps are unaffected |
| `SENTRY_DSN`, `RELEASE`                            | Crash reporting                                                  | Reporting is off                                    |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`           | Real-money checkout                                              | `POST /payments` returns "not configured"           |
| `RAZORPAY_WEBHOOK_SECRET`                          | Verifying payment webhooks                                       | Webhook is rejected                                 |
| `GOOGLE_OAUTH_CLIENT_IDS`, `APPLE_OAUTH_AUDIENCES` | Social sign-in                                                   | `POST /auth/oauth` returns "not configured"         |
| `EXPO_ACCESS_TOKEN`                                | Only if Expo "enhanced push security" is on                      | Pushes are sent unauthenticated                     |
| `PLATFORM_FEE_TIERS`                               | Demo only                                                        | Built-in sample tiers (not approved rates)          |

Reference: `apps/worker/.dev.vars.example`. Password hashing and session tokens need no secret.

## 4. Release the API (_unverified_)

```bash
cd apps/worker
# 1. Back up first (docs/operations/backup-restore.md §1).
pnpm exec wrangler d1 export pandam-db --remote --output ../../backups/pre-release-$(date +%F).sql
# 2. Apply migrations. They are additive and tested against populated data, but they ARE irreversible
#    in place — rollback is Time Travel (§6).
pnpm exec wrangler d1 migrations list pandam-db --remote
pnpm exec wrangler d1 migrations apply pandam-db --remote
# 3. Seed categories on a brand-new database only.
pnpm exec wrangler d1 execute pandam-db --remote --file ../../packages/database/seed/categories.sql
# 4. Deploy.
pnpm exec wrangler deploy
```

Migrate **before** deploying code that needs the new columns, and keep migrations additive so the previous Worker version keeps working until the new one is live.

Smoke test the live URL:

```bash
curl -s https://<your-worker>/health          # {"status":"ok", "env":"production"}
curl -s https://<your-worker>/api/v1/categories | head -c 200
```

then sign up with a throwaway account in the app against that URL.

## 5. First administrator

There is no API to become staff. After the first real user registers:

```bash
pnpm exec wrangler d1 execute pandam-db --remote --command \
  "UPDATE users SET role='admin' WHERE lower(email)=lower('you@example.com')"
```

Everything after that (moderators, suspensions) is done in the app. See `docs/architecture/admin.md`.

## 6. Roll back

| Problem                         | Action                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bad Worker code, schema fine    | `pnpm exec wrangler rollback` (or redeploy the previous commit). Migrations are additive, so the old code runs |
| Bad migration / bad data change | D1 Time Travel restore to just before it (`docs/operations/backup-restore.md` §2)                              |
| Leaked secret                   | Rotate it at the provider, `wrangler secret put`, redeploy; revoke sessions if session data may be exposed     |

## 7. Release the app (_unverified_)

`apps/app/eas.json` defines `development`, `preview` and `production` profiles. Each sets `EXPO_PUBLIC_ENV`; the API address and other public values come from `EXPO_PUBLIC_*` variables (see `apps/app/src/lib/env.ts`) — set them per profile (EAS environment variables or `eas.json` `env`), pointing `EXPO_PUBLIC_API_URL` at the deployed Worker. None of these are secret.

```bash
cd apps/app
pnpm exec eas build --profile preview --platform all      # internal testing
pnpm exec eas build --profile production --platform all   # store builds
pnpm exec eas submit --platform ios|android
```

Requires: an Expo account/EAS project, Apple Developer and Google Play accounts, signing credentials, store listings and a privacy policy. None of that exists in this repo. Before a store release, run `docs/testing/device-checklist.md` on real devices.

## 8. Known blockers for a real production launch

Taken from `DEVELOPMENT_AUDIT.md`; these are not solved by deploying.

- **Identity verification has no real provider.** The built-in flow is a demo and is refused when `PANDAM_ENV=production`, so production users could not finish onboarding. A real provider (for example DigiLocker) must be integrated first.
- **Razorpay**: only test mode has ever been considered; live credentials and a webhook registration are yours to provide.
- **Real-time chat** uses polling (4–15 s) plus an offline outbox with retries, not sockets. A Durable Object transport is designed but needs your approval to deploy.
- **Email is not verified at registration**, and password reset is not available (the login screen says so); users who lose their password cannot recover the account.
- **Rate limits and thresholds** are reasoned estimates, not measured from production traffic.
- **Push notifications** were never delivered to a real device by this project.
