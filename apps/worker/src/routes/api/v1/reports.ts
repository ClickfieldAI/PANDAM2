/**
 * `/api/v1/reports` — abuse reports and transaction disputes.
 *
 *   POST /            report a user, listing, need, message or transaction
 *   GET  /mine        reports the caller has filed (and their status)
 *   POST /disputes    raise a dispute about one barter transaction
 *   GET  /disputes/:transactionId   disputes the caller can see on a transaction
 *
 * There is no moderation UI in this phase: a report is a durable, reviewable
 * record with an `open` status, not something that automatically hides
 * content. Auto-hiding on report is how a marketplace gets weaponised, so
 * that decision stays human.
 */
import { createDisputeSchema, createReportSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { ApiError, sendOk } from '../../../lib/http';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, getAuth, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const reportsRoute = new Hono<AppEnv>();

reportsRoute.use('*', authMiddleware, requireAuth);

/** Reports a user may file per rolling 24 hours — enough for real abuse, too few to weaponise the form. */
const DAILY_REPORT_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXCERPT = 500;

type SubjectType = 'user' | 'listing' | 'need' | 'message' | 'transaction';

/**
 * Check the reporter may report this thing, and capture what it looks like
 * RIGHT NOW as evidence (content can be edited or deleted afterwards).
 *
 * `reports.subjectId` is polymorphic and has no foreign key, so this is also
 * what stops the table accumulating reports against ids that never existed.
 * Things the reporter could not see are answered with 404, exactly like a
 * missing one — a report must not become a way to probe what exists.
 */
async function resolveSubject(
  c: Context<AppEnv>,
  reporterId: string,
  subjectType: SubjectType,
  subjectId: string,
): Promise<Record<string, unknown>> {
  const { repos } = c.get('ctx');
  const notFound = () => new ApiError('not_found', 'The thing you are reporting does not exist.');
  const hidden = await repos.blocks.relatedUserIds(reporterId);

  switch (subjectType) {
    case 'user': {
      if (subjectId === reporterId)
        throw new ApiError('unprocessable', 'You cannot report yourself.');
      const target = await repos.users.findById(subjectId);
      if (!target) throw notFound();
      const profile = await repos.profiles.findByUserId(target.id);
      return { displayName: profile?.displayName ?? null, username: profile?.username ?? null };
    }
    case 'listing':
    case 'need': {
      const item =
        subjectType === 'listing'
          ? await repos.listings.findById(subjectId)
          : await repos.needs.findById(subjectId);
      if (!item || item.deletedAt !== null) throw notFound();
      if (item.ownerId === reporterId) {
        throw new ApiError('unprocessable', 'You cannot report your own item.');
      }
      // Visible to the reporter: published and not hidden by a block — or they
      // were a party to an offer on it (so they can still report a bad trade
      // after the item is taken down).
      const visible =
        (item.status === 'published' && !hidden.has(item.ownerId)) ||
        (await repos.offers.involvesItem(reporterId, item.id));
      if (!visible) throw notFound();
      return {
        ownerId: item.ownerId,
        title: item.title,
        description: item.description.slice(0, EXCERPT),
        status: item.status,
      };
    }
    case 'message': {
      const message = await repos.messages.findById(subjectId);
      if (!message || message.deletedAt) throw notFound();
      // Only someone who can read the conversation can report a message in it.
      if (!(await repos.conversations.isParticipant(message.conversationId, reporterId))) {
        throw notFound();
      }
      if (message.senderId === reporterId) {
        throw new ApiError('unprocessable', 'You cannot report your own message.');
      }
      return {
        senderId: message.senderId,
        conversationId: message.conversationId,
        body: message.body.slice(0, EXCERPT),
        hasImage: message.imageKey !== null,
        sentAt: message.createdAt,
      };
    }
    case 'transaction': {
      const t = await repos.barterTransactions.findById(subjectId);
      if (!t || (t.initiatedByUserId !== reporterId && t.counterpartyUserId !== reporterId)) {
        throw notFound();
      }
      return { offerId: t.offerId, status: t.status };
    }
  }
}

reportsRoute.post('/', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, createReportSchema);

  // Reporting the same thing again returns the report that is already open
  // instead of filing a duplicate (idempotent, and safe to retry).
  const live = await repos.reports.findLive(user.id, input.subjectType, input.subjectId);
  if (live) return sendOk(c, { report: toReportView(live), duplicate: true }, 200);

  if ((await repos.reports.countSince(user.id, Date.now() - DAY_MS)) >= DAILY_REPORT_CAP) {
    throw new ApiError(
      'too_many_requests',
      'You have sent a lot of reports today. Please try again tomorrow.',
    );
  }
  const snapshot = await resolveSubject(c, user.id, input.subjectType, input.subjectId);

  let report;
  try {
    report = await repos.reports.create({
      reporterId: user.id,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason,
      details: input.details ?? null,
      subjectSnapshot: JSON.stringify(snapshot),
    });
  } catch (error) {
    // Two identical reports racing: the unique index lets exactly one in.
    const winner = await repos.reports.findLive(user.id, input.subjectType, input.subjectId);
    if (winner) return sendOk(c, { report: toReportView(winner), duplicate: true }, 200);
    throw error;
  }
  return sendOk(c, { report: toReportView(report), duplicate: false }, 201);
});

function toReportView(r: {
  id: string;
  subjectType: string;
  subjectId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: number;
}) {
  return {
    id: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    reason: r.reason,
    details: r.details,
    status: r.status,
    createdAt: r.createdAt,
  };
}

reportsRoute.get('/mine', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const rows = await repos.reports.listByReporter(user.id);
  return sendOk(c, {
    items: rows.map((r) => ({
      id: r.id,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
});

reportsRoute.post('/disputes', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const input = await parseBody(c, createDisputeSchema);

  const transaction = await repos.barterTransactions.findById(input.transactionId);
  // Non-participants get 404 rather than 403: whether a transaction exists is
  // itself none of their business.
  const isParticipant =
    !!transaction &&
    (transaction.initiatedByUserId === user.id || transaction.counterpartyUserId === user.id);
  if (!isParticipant) {
    throw new ApiError('not_found', 'That transaction does not exist.');
  }

  const dispute = await repos.disputes.create({
    transactionId: input.transactionId,
    raisedByUserId: user.id,
    reason: input.reason,
    details: input.details ?? null,
  });

  return sendOk(
    c,
    {
      dispute: {
        id: dispute.id,
        transactionId: dispute.transactionId,
        reason: dispute.reason,
        details: dispute.details,
        status: dispute.status,
        createdAt: dispute.createdAt,
      },
    },
    201,
  );
});

reportsRoute.get('/disputes/:transactionId', async (c) => {
  const { user } = getAuth(c);
  const { repos } = c.get('ctx');
  const transactionId = c.req.param('transactionId');
  const transaction = await repos.barterTransactions.findById(transactionId);
  const isParticipant =
    !!transaction &&
    (transaction.initiatedByUserId === user.id || transaction.counterpartyUserId === user.id);
  if (!isParticipant) throw new ApiError('not_found', 'That transaction does not exist.');

  const rows = await repos.disputes.listByTransaction(transactionId);
  return sendOk(c, {
    items: rows.map((d) => ({
      id: d.id,
      transactionId: d.transactionId,
      reason: d.reason,
      details: d.details,
      status: d.status,
      mine: d.raisedByUserId === user.id,
      createdAt: d.createdAt,
    })),
  });
});
