# Admin / moderation (Milestone 7)

## 1. Access control (designed first)

**Roles** — `users.role`: `user` (default) | `moderator` | `admin`.

| Capability                                      | user | moderator | admin |
| ----------------------------------------------- | :--: | :-------: | :---: |
| Review reports (list, detail, status, note)     |  –   |     ✓     |   ✓   |
| Take down / reinstate a listing or request      |  –   |     ✓     |   ✓   |
| Suspend / unsuspend a user (role `user` only)   |  –   |     ✓     |   ✓   |
| Suspend / unsuspend a moderator or admin        |  –   |     –     |   ✓   |
| Inspect transactions (read-only)                |  –   |     ✓     |   ✓   |
| View a user's detail (includes email — audited) |  –   |     ✓     |   ✓   |
| Change roles                                    |  –   |     –     |   ✓   |
| Read the audit log                              |  –   |     –     |   ✓   |

**Rules**

- Everything lives under `/api/v1/admin/*`. The router runs `authMiddleware`, `requireAuth`, then `requireRole`.
- The role is read from the database on every request (never from the token), so demotion/suspension takes effect immediately. Suspension revokes all sessions.
- No public path to become staff. The first admin is created by a direct database update (see below). Registration does not verify email, so email-based promotion would be an attack.
- Every mutation requires a `reason` (≥ 5 characters) and writes an append-only `admin_audit_log` row. Viewing a user's detail (PII) is audited too.
- Guards: nobody suspends or changes the role of themselves; a moderator cannot act on a moderator/admin; the last admin cannot be demoted or suspended.
- Admin writes are rate-limited (`POLICIES`).
- The app hides the Admin entry unless `/auth/me` reports a staff role, but this is cosmetic: the server enforces.

**Bootstrap the first admin** (local):

```bash
cd apps/worker
pnpm exec wrangler d1 execute pandam-db --local --command "UPDATE users SET role='admin' WHERE lower(email)=lower('you@example.com')"
```

(Use `--remote` only with your own deployment decision; this repo does not deploy.)

## 2. Behaviour

- **Suspension** — `users.status='suspended'`, sessions revoked, login refused (403 "This account is suspended."). Their listings/requests disappear from discovery, matches, recommendations and public detail; new offers/counters/accepts/messages involving them are refused. Trades already in progress are left untouched so the counterparty can still confirm or cancel. Unsuspend restores everything.
- **Takedown** — sets the item to `archived`, records `moderation_removed_at/_reason/_by`, withdraws pending offers on it, and notifies the owner (`moderation_notice`). The owner cannot re-publish while it is taken down. Reinstate clears the markers; the item stays archived so the owner chooses to re-publish.
- **Report review** — `open → reviewing → resolved | dismissed` (and `reviewing → open`); resolved/dismissed are final. Records reviewer, time and a note. The reporter gets a `report_update` notification on resolve/dismiss.
- **Transactions** — read-only list/detail with offer, parties, events and disputes.

## 3. Not covered

No bulk tools, no appeals flow, no staff 2FA, no admin web UI beyond the app screens.
