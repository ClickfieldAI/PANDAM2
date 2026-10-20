# Barter engine (offers → transactions)

Implemented in `apps/worker/src/services/barter.ts`, `packages/database/src/repositories/{offers,barter-engine}.ts`.

## Why it looks the way it does

Cloudflare D1 has no interactive transactions — only `batch()` (several statements, all-or-nothing). So correctness comes from:

1. **Single-statement compare-and-swap (CAS)** for every state change (`UPDATE … WHERE status = 'pending' … RETURNING`). Of N concurrent requests exactly one gets a row back.
2. **Idempotent follow-up work.** After the CAS, everything else (transaction row, conversation, item status, sibling cancellation, history events) is written in one `batch()` using `ON CONFLICT DO NOTHING` / guarded `WHERE` clauses, so re-running it converges on the same state.
3. **Self-healing.** If a request dies between the CAS and the batch, the next `accept` retry — or any read of that offer — finishes the job.
4. **Unique indexes** are the final arbiter for duplicates: one pending offer per (sender, requested item); one offer per (sender, `Idempotency-Key`); one history event per (transaction, type, actor).

## Lifecycle

```
offer:        pending ─accept→ accepted      (recipient; must be unexpired and items still published)
                      ─reject→ rejected      (recipient)
                      ─cancel→ cancelled     (sender)
                      ─(time)→ expired       (lazily, when someone tries to act on it)

transaction:  in_progress ─confirm(A)─confirm(B)→ completed   (BOTH parties required)
              in_progress ─cancel→ cancelled                    (items return to `published`)
              created  ─start→ in_progress                      (legacy rows only)
```

Accepting takes both items to `traded`. Cancelling restores an item only if it is still `traded` (an owner who archived it in the meantime is respected). Completing leaves them `traded`.

## API notes

- `POST /offers` accepts an optional `Idempotency-Key` header (8–80 chars). A replay returns the original offer (200); reusing the key for a different offer is a 409.
- `POST /transactions/:id/status` actions: `confirm`, `cancel` (and legacy `complete` ≡ `confirm`, `start`). No single action completes a trade on one party's word.
- Every transaction view carries `confirmedByMe`, `confirmedByCounterparty` and an ordered `events` list.

## What is NOT covered

- A scheduled sweep for expired offers (expiry is applied lazily).
- Proof of behaviour on production D1 across Worker isolates; tests use a single-connection SQLite and the local D1 emulation.

## Counter offers

`POST /offers/:id/counter` (recipient only, pending + unexpired, item-for-item only): the original becomes `countered` via a compare-and-swap and a new pending offer is created in the opposite direction with `parent_offer_id` pointing back (unique index ⇒ at most one counter per offer). A negotiation can be countered at most 3 times (`MAX_COUNTER_DEPTH`). If creating the counter fails after the status change, `reopenIfNoChild` restores the original; if the process dies in that window, a retry of the same counter finishes it. `GET /offers/:id/history` returns the whole chain, oldest first, from any member. Accepting a counter is the normal accept flow, with the counterer as the transaction's initiator.

## Deleting items (listings and requests)

`DELETE /listings/:id` and `DELETE /needs/:id` (owner only). Offers reference items with `ON DELETE CASCADE`, so deletion follows a policy enforced inside the SQL statements (`repositories/item-lifecycle.ts`):

1. an item no offer ever referenced is **hard-deleted** (its photo rows and saves cascade; stored files are removed afterwards);
2. an item with history is **archived and hidden** (`deleted_at` set) so old offers and trades still show what was swapped;
3. an item in an **open trade** (created / in progress / disputed) cannot be deleted.

Pending offers on the item are withdrawn first and the other side is notified. Favourites of a hidden listing are removed.

## Trust and safety

- **Blocking** (`/api/v1/blocks`, `services/blocks.ts`): a block applies in both directions. It is checked when an offer is created, countered or accepted, when a message is sent, and it filters discovery, item detail, saved lists, recommendations, matches and need alerts. Blocking withdraws pending offers between the two silently and never touches an agreed trade. The blocked person is never told: their error is the neutral "This person is not available."
- **Reports** (`POST /api/v1/reports`): idempotent per (reporter, subject) via a unique index on live reports; the reporter must be able to see the subject; an evidence snapshot is stored; 20 reports/day per account. Reports are write-only until the admin milestone.
- **Privacy regression test**: `test/trust-safety.test.ts` plants canary values and walks every read endpoint as other users. Add any new endpoint to its list.

## Chat reliability

- Every message carries a client id (`messages.client_id`, unique per sender). `POST /conversations/:id/messages` with a repeated id returns the stored message (200, `replayed: true`) and notifies no one again; the lookup happens before the archived/blocked checks so a sender always learns a stored message went through.
- `MessageView.readByRecipient` (own messages only) is true only when every other participant's read marker is at or after the message. There is no "delivered" state.
- `ConversationView.unreadCount` counts the other people's unread, non-deleted messages.
- The app keeps text messages in a persistent per-user outbox (`apps/app/src/lib/chat/`): rules in `outbox-core.ts` (pure, unit-tested), sending/retrying in `OutboxProvider.tsx` (mounted in the signed-in layout so retries continue after leaving a chat).
