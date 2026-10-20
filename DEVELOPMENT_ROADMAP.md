# PANDAM2 (Spondum) — Development Roadmap

Derived from `DEVELOPMENT_AUDIT.md`. Order = foundational correctness first, then features that depend on it, then polish. Estimates are single-engineer working days including tests.

## Ground rules for every milestone

- Server is the authority; UI only reflects persisted state.
- Multi-step writes must be atomic (D1 `batch`) or built from single-statement compare-and-swap + unique indexes, because D1 has no interactive transactions and the test DB cannot reproduce D1 concurrency.
- Additive, non-destructive migrations only.
- Each milestone ends with: worker tests, typecheck, lint, format, build; a written report distinguishing what was automatically verified, manually verified, and unverified.
- Nothing is committed or pushed without explicit authorisation.

## Milestones

### M1 — Offer & transaction engine hardening _(≈4 d — starting now)_

**Why first:** every other feature (chat, reviews, notifications, admin) hangs off offers/transactions; the audit found 4 HIGH defects here.

Scope

1. `acceptOffer` as a safe operation: conditional `UPDATE … WHERE status='pending' AND (expires_at IS NULL OR expires_at > now)` (CAS), then an **idempotent finalisation** (transaction + conversation + item status + sibling cancellation) in one D1 batch; retrying `accept` on an already-accepted offer completes any missing pieces and returns current state.
2. Enforce expiry (lazy, on accept/respond and on list reads) and re-validate item availability at accept.
3. Both-party completion: per-party confirmation timestamps; transaction becomes `completed` only after both confirm; `start` step removed from the user flow (transactions begin `in_progress` on accept) while keeping DB compatibility.
4. Cancellation (before completion) restores the items to `published` (only if still `traded` by this transaction) and re-opens nothing else.
5. Duplicate-submission guard: unique partial index on pending (sender, requested item); `Idempotency-Key` on offer creation.
6. Transaction event log (who/what/when) surfaced in the transaction view.
7. App: transaction screen shows per-party confirmation state, "Confirm exchange" action, event history; offer screen handles expiry and retry.

Acceptance criteria — see the milestone brief in the report; each is a named test.
Dependencies: none. Risk: migration on populated tables (columns are additive, defaults safe).

### M2 — Counter offers & offer history _(≈2 d — DONE, see audit §8)_

`counter` action (supersedes original, creates reverse pending offer linked by `parent_offer_id`, max chain depth), notifications, app UI. Depends on M1.

### M3 — Marketplace completeness _(≈4 d — favourites, delete and image validation DONE, see audit §9; search filters and N+1 remain)_

Favourites (table, endpoints, optimistic UI, saved list, per-user enforcement); listing delete/archive policy; magic-byte image validation + orphan cleanup; filter/search additions that have a real backing (price range, availability); fix N+1 hydration. Depends on M1 (item-state rules).

### M4 — Trust & safety _(≈4 d — blocking, report workflow and privacy audit DONE, see audit §10)_

Blocking (table + enforcement in offers/chat/discovery), report workflow states, review surface checks, serializer leak audit. Depends on M1.

### M5 — Chat reliability _(≈4 d — dedupe, delivery states and outbox DONE, see audit §11; real-time transport waits for deployment approval)_

Client message ids + server dedupe, honest delivery states (queued/sent/failed — "delivered" only where there is evidence), offline outbox/retry, unread-count verification. Real-time (WebSocket/DO) only after deployment approval; polling stays until then. Depends on M4 (block checks).

### M6 — Backend hardening & observability _(≈3 d — DONE, see audit §12)_

Rate limiting (D1- or DO-backed), Sentry in the worker, structured logging with request ids, error taxonomy review, security regression tests.

### M7 — Admin _(≈5 d — DONE, see audit §13)_

Design access control first (`is_admin`, audited actions); then user suspension, listing takedown, report review, transaction inspection — each persisted and tested. Depends on M4/M6.

### M8 — Animations (Lottie) & UX polish _(≈3 d — DONE, see audit §14)_

Verify Lottie compatibility with Expo SDK 57 before installing; animations for offer sent / accepted / exchange completed, gated by reduced motion, correct in Light and Dark; **only fired after the server confirms success**.

### M9 — Testing & release readiness _(≈4 d — DONE, see audit §15)_

App unit tests, E2E flow script (Maestro) documented for device runs, migration-on-populated-data tests, backup/restore runbook (D1 export/time-travel), deployment and handover docs, device checklist.

## Blocked / external (cannot be closed in this repo alone)

Identity-verification provider; Razorpay live credentials; physical-device verification of push/haptics/camera; Cloudflare deployment and Durable-Object real-time transport.
