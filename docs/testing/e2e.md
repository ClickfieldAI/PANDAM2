# Testing strategy and end-to-end flows

## What is automated today (runs in CI)

| Layer                       | Where              | What it proves                                                                                                                                                                    |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API integration (373 tests) | `apps/worker/test` | Real routes, real migrations, in-memory SQLite: auth, barter engine, counters, trust & safety, chat reliability, rate limits, security sweep, admin, migrations on populated data |
| App unit (43 tests)         | `apps/app/test`    | Chat outbox state machine, drafts and tour storage, formatting, query keys, tour content                                                                                          |
| Shared utils (3)            | `packages/utils`   |                                                                                                                                                                                   |
| Static                      | CI                 | Prettier, ESLint, `tsc` for every package, production build                                                                                                                       |

Run everything: `pnpm test`. API only: `pnpm --filter @pandam/worker test`.

**Limits of the automated suite (be honest about these):**

- The test database is in-memory libSQL, run serially. It proves the logic, **not** D1 concurrency; compare-and-swap statements are designed for D1 but only exercised one at a time.
- There are no automated UI tests: nothing renders a React Native screen under test. Screens are checked by TypeScript, lint and the manual checklist.
- Nothing runs on a real device, against real Cloudflare, Razorpay, Sentry or Expo push.

## Manual end-to-end script (about 20 minutes, two accounts)

Use two devices, or one device and the web build, against a local or staging API. Pre-conditions: API running with migrations applied and categories seeded.

1. **Sign-up & onboarding** — register A and B; finish identity verification (demo mode only works when `PANDAM_ENV` is not `production`); take or skip the tour.
2. **Listings** — A creates a published listing with a photo; B creates a published listing and a request ("I need"). Both appear in Discover; the photo loads.
3. **Offer** — B opens A's listing, sends an offer. A sees a notification and the offer. A counters; B sees the counter and accepts.
4. **Chat** — a conversation exists after acceptance. Send text and a photo from both sides. Turn airplane mode on, send, turn it off: the message shows "waiting", then sends once (no duplicate). "Seen" appears only after the other side opens the chat.
5. **Trade completion** — A confirms: status says waiting for B. B confirms: trade completes, the confirmation animation plays, both can leave a review.
6. **Cancel path** — repeat 2–3 with new items, cancel instead; both items are back in Discover.
7. **Safety** — B reports A's listing, then blocks A. A can no longer see B's items or message B, and the wording to A does not say who blocked whom. B finds A under Profile → Blocked people and unblocks.
8. **Favourites** — save a listing, restart the app, it is still saved; delete it as owner, it disappears from Saved.
9. **Delete** — delete a listing with no offers (gone) and one with history (hidden, history intact).
10. **Moderation** (promote a third account with the SQL in `docs/operations/deployment.md` §5) — file the report from step 7 as B; as the moderator open Profile → Moderation, review it, take the listing down, suspend A. A is signed out and cannot sign back in; unsuspend restores sign-in.
11. **Theme** — Profile → Security → Appearance: Light, Dark, System; every screen above stays readable.

Record date, device, OS version, build, and pass/fail per step in the checklist (`docs/testing/device-checklist.md`).

## Maestro flows (device automation) — written, not run

`e2e/maestro/*.yaml` hold [Maestro](https://maestro.mobile.dev) flows for a built app (development build or `preview` build — Maestro cannot drive Expo Go reliably). They were **written against the source, never executed**: expect to adjust selectors on the first run.

```bash
# install Maestro per its docs, start a simulator/emulator with the app installed, then:
EMAIL=qa@example.com PASSWORD='…' maestro test e2e/maestro/login-and-tabs.yaml
```

Credentials come from environment variables on purpose — never write real ones into a flow file. Use a test account on a non-production API.

Adding stable `testID`s to key controls would make these flows far less brittle; that has not been done.
