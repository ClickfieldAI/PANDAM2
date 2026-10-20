/**
 * `/api/v1/admin` — staff tools. Design and permission matrix:
 * docs/architecture/admin.md.
 *
 * Every route here requires a signed-in `moderator` or `admin` (the role is
 * read from the database on each request). Role changes and the audit log are
 * `admin` only. Every mutation requires a `reason` and is written to the
 * append-only audit log, as is viewing a user's detail (it shows an email).
 *
 *   GET  /users                  search users
 *   GET  /users/:id              one user (audited view)
 *   POST /users/:id/suspend      suspend (revokes sessions)
 *   POST /users/:id/unsuspend
 *   POST /users/:id/role         admin only
 *   GET  /reports                list / filter
 *   GET  /reports/:id            detail: snapshot, subject now, related reports
 *   POST /reports/:id/review     open|reviewing|resolved|dismissed (+ note)
 *   GET  /listings/:id           inspect (also /needs/:id)
 *   POST /listings/:id/takedown  remove from circulation (also /needs/:id/…)
 *   POST /listings/:id/reinstate
 *   GET  /transactions           read-only
 *   GET  /transactions/:id       read-only, with events + disputes
 *   GET  /audit                  admin only
 */
import {
  type AdminAuditView,
  type AdminItemView,
  type AdminReportDetail,
  type AdminReportView,
  type AdminSubjectState,
  type AdminTransactionDetail,
  type AdminTransactionView,
  type AdminUserView,
} from '@pandam/types';
import {
  adminAuditQuerySchema,
  adminReasonSchema,
  adminReportReviewSchema,
  adminReportsQuerySchema,
  adminSetRoleSchema,
  adminTransactionsQuerySchema,
  adminUsersQuerySchema,
} from '@pandam/validation';
import { type Context } from 'hono';
import { Hono } from 'hono';

import {
  canTransitionReport,
  isClosedReport,
  reportSourcesFor,
} from '../../../domain/report-workflow';
import { ApiError, sendOk } from '../../../lib/http';
import { describeError, log } from '../../../lib/log';
import { parseBody, parseQuery } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { requireRole } from '../../../middleware/roles';
import { notify } from '../../../services/notify';
import { type AppEnv } from '../../../types';

type Ctx = Context<AppEnv>;
type ItemKind = 'listing' | 'need';

export const adminRoute = new Hono<AppEnv>();

adminRoute.use('*', authMiddleware, requireAuth, requireRole('moderator', 'admin'));

/* ------------------------------------------------------------------ helpers */

/** Record a staff action. Called AFTER the change succeeded; a failure here is loud, never silent. */
async function audit(
  c: Ctx,
  action: string,
  targetType: string,
  targetId: string,
  reason: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const entry = {
    actorId: user.id,
    action,
    targetType,
    targetId,
    reason,
    metadata: metadata ?? null,
  };
  try {
    await repos.admin.audit(entry);
  } catch {
    try {
      await repos.admin.audit(entry); // one retry
    } catch (error) {
      log('error', 'admin.audit_failed', { ...entry, error: describeError(error) });
      throw new ApiError(
        'internal_error',
        'The action was applied but could not be recorded in the audit log. Contact an administrator.',
      );
    }
  }
}

async function toUserView(c: Ctx, id: string): Promise<AdminUserView | null> {
  const { repos } = c.get('ctx');
  const user = await repos.users.findById(id);
  if (!user) return null;
  const profile = await repos.profiles.findByUserId(id);
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    displayName: profile?.displayName ?? null,
    username: profile?.username ?? null,
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason,
    createdAt: user.createdAt,
  };
}

/** A moderator may act only on ordinary users; nobody acts on themselves. */
function assertMayActOn(c: Ctx, target: { id: string; role: string }): void {
  const { user } = getAuth(c);
  if (target.id === user.id) {
    throw new ApiError('unprocessable', 'You cannot do this to your own account.');
  }
  if (user.role !== 'admin' && target.role !== 'user') {
    throw new ApiError('forbidden', 'Only an administrator can act on staff accounts.');
  }
}

function parseJson(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const toReportView = (r: {
  id: string;
  reporterId: string;
  subjectType: AdminReportView['subjectType'];
  subjectId: string;
  reason: AdminReportView['reason'];
  details: string | null;
  subjectSnapshot: string | null;
  status: AdminReportView['status'];
  reviewedBy: string | null;
  reviewedAt: number | null;
  resolutionNote: string | null;
  createdAt: number;
}): AdminReportView => ({
  id: r.id,
  reporterId: r.reporterId,
  subjectType: r.subjectType,
  subjectId: r.subjectId,
  reason: r.reason,
  details: r.details,
  snapshot: parseJson(r.subjectSnapshot),
  status: r.status,
  reviewedBy: r.reviewedBy,
  reviewedAt: r.reviewedAt,
  resolutionNote: r.resolutionNote,
  createdAt: r.createdAt,
});

async function subjectState(
  c: Ctx,
  type: AdminReportView['subjectType'],
  id: string,
): Promise<AdminSubjectState> {
  const { repos } = c.get('ctx');
  const gone: AdminSubjectState = {
    exists: false,
    label: null,
    ownerId: null,
    status: null,
    takenDown: false,
  };
  switch (type) {
    case 'user': {
      const u = await repos.users.findById(id);
      if (!u) return gone;
      const p = await repos.profiles.findByUserId(id);
      return {
        exists: true,
        label: p?.displayName ?? null,
        ownerId: u.id,
        status: u.status,
        takenDown: false,
      };
    }
    case 'listing':
    case 'need': {
      const item = await repos.admin.findItem(type, id);
      if (!item) return gone;
      return {
        exists: true,
        label: item.title,
        ownerId: item.ownerId,
        status: item.deletedAt != null ? 'deleted' : item.status,
        takenDown: item.moderationRemovedAt != null,
      };
    }
    case 'message': {
      const m = await repos.messages.findById(id);
      if (!m || m.deletedAt) return gone;
      return {
        exists: true,
        label: m.body.slice(0, 200),
        ownerId: m.senderId,
        status: null,
        takenDown: false,
      };
    }
    case 'transaction': {
      const t = await repos.barterTransactions.findById(id);
      if (!t) return gone;
      return { exists: true, label: null, ownerId: null, status: t.status, takenDown: false };
    }
  }
}

/* -------------------------------------------------------------------- users */

adminRoute.get('/users', async (c) => {
  const q = parseQuery(c, adminUsersQuerySchema);
  const { repos } = c.get('ctx');
  const rows = await repos.admin.searchUsers(q);
  const items = (await Promise.all(rows.map((u) => toUserView(c, u.id)))).filter(
    (u): u is AdminUserView => u !== null,
  );
  if (q.q)
    await audit(c, 'user.search', 'user', '*', null, { hasQuery: true, results: items.length });
  return sendOk(c, { items, limit: q.limit, offset: q.offset });
});

adminRoute.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const view = await toUserView(c, id);
  if (!view) throw new ApiError('not_found', 'That user does not exist.');
  const { repos } = c.get('ctx');
  await audit(c, 'user.view', 'user', id, null);
  const reportsAbout = await repos.reports.listBySubject('user', id);
  const history = await repos.admin.listAudit({
    limit: 20,
    offset: 0,
    targetType: 'user',
    targetId: id,
  });
  return sendOk(c, {
    user: view,
    reportsAboutUser: reportsAbout.map(toReportView),
    // Staff history on this account is visible to staff; the full log is admin-only.
    actions: history.map((h) => ({
      action: h.action,
      reason: h.reason,
      actorId: h.actorId,
      createdAt: h.createdAt,
    })),
  });
});

adminRoute.post('/users/:id/suspend', async (c) => {
  const { reason } = await parseBody(c, adminReasonSchema);
  const { repos } = c.get('ctx');
  const id = c.req.param('id');
  const target = await repos.users.findById(id);
  if (!target) throw new ApiError('not_found', 'That user does not exist.');
  assertMayActOn(c, target);
  if (target.status === 'suspended')
    throw new ApiError('conflict', 'That user is already suspended.');
  if (target.status !== 'active') throw new ApiError('conflict', 'That account is not active.');
  const done = await repos.admin.suspendUser(id, reason);
  if (!done) {
    // Lost a race, or this was the last active administrator.
    throw new ApiError(
      'conflict',
      'The user could not be suspended (state changed, or last administrator).',
    );
  }
  await audit(c, 'user.suspend', 'user', id, reason);
  return sendOk(c, { user: await toUserView(c, id) });
});

adminRoute.post('/users/:id/unsuspend', async (c) => {
  const { reason } = await parseBody(c, adminReasonSchema);
  const { repos } = c.get('ctx');
  const id = c.req.param('id');
  const target = await repos.users.findById(id);
  if (!target) throw new ApiError('not_found', 'That user does not exist.');
  assertMayActOn(c, target);
  const done = await repos.admin.unsuspendUser(id);
  if (!done) throw new ApiError('conflict', 'That user is not suspended.');
  await audit(c, 'user.unsuspend', 'user', id, reason);
  return sendOk(c, { user: await toUserView(c, id) });
});

adminRoute.post('/users/:id/role', requireRole('admin'), async (c) => {
  const { role, reason } = await parseBody(c, adminSetRoleSchema);
  const { repos } = c.get('ctx');
  const id = c.req.param('id');
  const target = await repos.users.findById(id);
  if (!target) throw new ApiError('not_found', 'That user does not exist.');
  assertMayActOn(c, target);
  if (target.status !== 'active') {
    throw new ApiError('unprocessable', 'Roles can only be changed on active accounts.');
  }
  if (target.role === role) throw new ApiError('conflict', `That user is already ${role}.`);
  const done = await repos.admin.setRole(id, role);
  if (!done)
    throw new ApiError(
      'conflict',
      'The role could not be changed (state changed, or last administrator).',
    );
  await audit(c, 'user.role', 'user', id, reason, { from: target.role, to: role });
  return sendOk(c, { user: await toUserView(c, id) });
});

/* ------------------------------------------------------------------ reports */

adminRoute.get('/reports', async (c) => {
  const q = parseQuery(c, adminReportsQuerySchema);
  const rows = await c.get('ctx').repos.admin.listReports(q);
  return sendOk(c, { items: rows.map(toReportView), limit: q.limit, offset: q.offset });
});

adminRoute.get('/reports/:id', async (c) => {
  const { repos } = c.get('ctx');
  const row = await repos.admin.findReport(c.req.param('id'));
  if (!row) throw new ApiError('not_found', 'That report does not exist.');
  const related = (await repos.reports.listBySubject(row.subjectType, row.subjectId)).filter(
    (r) => r.id !== row.id,
  );
  const detail: AdminReportDetail = {
    ...toReportView(row),
    reporter: await toUserView(c, row.reporterId),
    subject: await subjectState(c, row.subjectType, row.subjectId),
    related: related.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt,
    })),
  };
  await audit(c, 'report.view', 'report', row.id, null);
  return sendOk(c, { report: detail });
});

adminRoute.post('/reports/:id/review', async (c) => {
  const body = await parseBody(c, adminReportReviewSchema);
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const row = await repos.admin.findReport(c.req.param('id'));
  if (!row) throw new ApiError('not_found', 'That report does not exist.');
  if (!canTransitionReport(row.status, body.status)) {
    throw new ApiError('conflict', `A ${row.status} report cannot become ${body.status}.`);
  }
  if (isClosedReport(body.status) && !body.note) {
    throw new ApiError('validation_error', 'A note is required to close a report.', {
      note: ['Explain the decision (at least 5 characters).'],
    });
  }
  const updated = await repos.admin.transitionReport(
    row.id,
    reportSourcesFor(body.status),
    body.status,
    user.id,
    body.note ?? null,
  );
  if (!updated) throw new ApiError('conflict', 'Someone else just changed this report. Reload it.');
  await audit(c, 'report.review', 'report', row.id, body.note ?? null, {
    from: row.status,
    to: body.status,
  });
  if (isClosedReport(body.status)) {
    // Tell the reporter a decision was made. No outcome detail: it may concern a third party.
    await notify(c, {
      userId: row.reporterId,
      type: 'report_update',
      data: { reportId: row.id, status: body.status },
    });
  }
  return sendOk(c, { report: toReportView(updated) });
});

/* ------------------------------------------------------------ listings/needs */

function itemView(
  kind: ItemKind,
  row: NonNullable<Awaited<ReturnType<typeof findItem>>>,
): AdminItemView {
  return {
    id: row.id,
    kind,
    ownerId: row.ownerId,
    title: row.title,
    status: row.status,
    removedAt: row.moderationRemovedAt,
    removedReason: row.moderationReason,
    removedBy: row.moderationBy,
  };
}
const findItem = (c: Ctx, kind: ItemKind, id: string) =>
  c.get('ctx').repos.admin.findItem(kind, id);

for (const [segment, kind] of [
  ['listings', 'listing'],
  ['needs', 'need'],
] as const) {
  adminRoute.get(`/${segment}/:id`, async (c) => {
    const row = await findItem(c, kind, c.req.param('id'));
    if (!row) throw new ApiError('not_found', `That ${kind} does not exist.`);
    return sendOk(c, { item: itemView(kind, row) });
  });

  adminRoute.post(`/${segment}/:id/takedown`, async (c) => {
    const { reason } = await parseBody(c, adminReasonSchema);
    const { user } = getAuth(c);
    const { repos } = c.get('ctx');
    const id = c.req.param('id');
    const row = await findItem(c, kind, id);
    if (!row) throw new ApiError('not_found', `That ${kind} does not exist.`);
    if (row.moderationRemovedAt != null)
      throw new ApiError('conflict', `That ${kind} is already removed.`);
    const done = await repos.admin.takeDown(kind, id, reason, user.id);
    if (!done) throw new ApiError('conflict', `That ${kind} is already removed.`);
    // Pending offers on it are withdrawn; the other side is told, the owner is told why.
    const withdrawn = await repos.itemLifecycle.withdrawPendingOffers(kind, id);
    for (const offer of withdrawn) {
      const other = offer.fromUserId === row.ownerId ? offer.toUserId : offer.fromUserId;
      if (other !== row.ownerId) {
        await notify(c, { userId: other, type: 'offer_cancelled', data: { offerId: offer.id } });
      }
    }
    await notify(c, {
      userId: row.ownerId,
      type: 'moderation_notice',
      data: { kind, itemId: id, reason: reason.slice(0, 200) },
      body: `Removed by a moderator: ${reason}`.slice(0, 140),
    });
    await audit(c, `${kind}.takedown`, kind, id, reason, { withdrawnOffers: withdrawn.length });
    return sendOk(c, { item: itemView(kind, done), withdrawnOffers: withdrawn.length });
  });

  adminRoute.post(`/${segment}/:id/reinstate`, async (c) => {
    const { reason } = await parseBody(c, adminReasonSchema);
    const { repos } = c.get('ctx');
    const id = c.req.param('id');
    const row = await findItem(c, kind, id);
    if (!row) throw new ApiError('not_found', `That ${kind} does not exist.`);
    const done = await repos.admin.reinstate(kind, id);
    if (!done) throw new ApiError('conflict', `That ${kind} is not removed.`);
    await audit(c, `${kind}.reinstate`, kind, id, reason);
    return sendOk(c, { item: itemView(kind, done) });
  });
}

/* ------------------------------------------------------------- transactions */

const toTxView = (t: {
  id: string;
  status: AdminTransactionView['status'];
  offerId: string;
  initiatedByUserId: string;
  counterpartyUserId: string;
  initiatorConfirmedAt: number | null;
  counterpartyConfirmedAt: number | null;
  createdAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
}): AdminTransactionView => ({
  id: t.id,
  status: t.status,
  offerId: t.offerId,
  initiatedBy: t.initiatedByUserId,
  counterparty: t.counterpartyUserId,
  initiatorConfirmed: t.initiatorConfirmedAt != null,
  counterpartyConfirmed: t.counterpartyConfirmedAt != null,
  createdAt: t.createdAt,
  completedAt: t.completedAt,
  cancelledAt: t.cancelledAt,
});

adminRoute.get('/transactions', async (c) => {
  const q = parseQuery(c, adminTransactionsQuerySchema);
  const rows = await c.get('ctx').repos.admin.listTransactions(q);
  return sendOk(c, { items: rows.map(toTxView), limit: q.limit, offset: q.offset });
});

adminRoute.get('/transactions/:id', async (c) => {
  const { repos } = c.get('ctx');
  const t = await repos.barterTransactions.findById(c.req.param('id'));
  if (!t) throw new ApiError('not_found', 'That transaction does not exist.');
  const offer = await repos.offers.findById(t.offerId);
  const ref = async (kind: ItemKind, id: string | null) => {
    if (!id) return null;
    const row = await repos.admin.findItem(kind, id);
    return { kind, id, title: row?.title ?? null };
  };
  const events = await repos.barterEngine.listEvents(t.id);
  const disputes = await repos.disputes.listByTransaction(t.id);
  const detail: AdminTransactionDetail = {
    ...toTxView(t),
    offeredItem: await ref('listing', offer?.offeredListingId ?? null),
    requestedItem: offer?.requestedListingId
      ? await ref('listing', offer.requestedListingId)
      : await ref('need', offer?.requestedNeedId ?? null),
    events: events.map((e) => ({ type: e.type, actorId: e.actorUserId, createdAt: e.createdAt })),
    disputes: disputes.map((d) => ({
      id: d.id,
      status: d.status,
      reason: d.reason,
      createdAt: d.createdAt,
    })),
  };
  await audit(c, 'transaction.view', 'transaction', t.id, null);
  return sendOk(c, { transaction: detail });
});

/* -------------------------------------------------------------------- audit */

adminRoute.get('/audit', requireRole('admin'), async (c) => {
  const q = parseQuery(c, adminAuditQuerySchema);
  const rows = await c.get('ctx').repos.admin.listAudit(q);
  const items: AdminAuditView[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    metadata: parseJson(r.metadata),
    createdAt: r.createdAt,
  }));
  return sendOk(c, { items, limit: q.limit, offset: q.offset });
});
