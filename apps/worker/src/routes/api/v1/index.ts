/**
 * PANDAM API v1.
 *
 * `contextMiddleware` builds the DB-backed `RequestContext` for the groups that
 * need it. `GET /api/v1` describes the surface. Every non-implemented resource
 * group is mounted and returns `501 not_implemented` (see `./planned.ts`).
 */
import { Hono } from 'hono';

import { type AppDeps } from '../../../context';
import { sendOk } from '../../../lib/http';
import { contextMiddleware } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

import { authRoute } from './auth';
import { categoriesRoute } from './categories';
import { conversationsRoute } from './conversations';
import { demoFeesRoute } from './demo-fees';
import { createMarketRoute } from './market';
import { matchesRoute } from './matches';
import { mediaRoute } from './media';
import { notificationsRoute } from './notifications';
import { offersRoute } from './offers';
import { paymentsRoute } from './payments';
import { PLANNED_GROUPS, plannedGroupRouter } from './planned';
import { profilesRoute } from './profiles';
import { recommendationsRoute } from './recommendations';
import { reportsRoute } from './reports';
import { reviewsRoute } from './reviews';
import { transactionsRoute } from './transactions';
import { usersRoute } from './users';
import { verificationRoute } from './verification';

const IMPLEMENTED = [
  {
    name: 'auth',
    summary: 'Session authentication (register / login / logout / me)',
    endpoints: ['POST /register', 'POST /login', 'POST /logout', 'GET /me'],
  },
  {
    name: 'users',
    summary: 'Account management for the signed-in user',
    endpoints: [
      'GET /me/sessions',
      'DELETE /me/sessions/:id',
      'POST /me/sessions/revoke-others',
      'POST /me/change-password',
      'DELETE /me',
    ],
  },
  {
    name: 'profiles',
    summary: "The caller's own profile",
    endpoints: ['GET /me', 'PUT /me', 'PATCH /me', 'POST /me/avatar'],
  },
  {
    name: 'categories',
    summary: 'Curated categories (normalised matching key)',
    endpoints: ['GET /'],
  },
  {
    name: 'listings',
    summary: '"I HAVE" — products, services, skills; barter, sale, or both',
    endpoints: [
      'GET /',
      'GET /mine',
      'GET /cities',
      'POST /',
      'GET /:id',
      'PATCH /:id',
      'POST /:id/status',
      'POST /:id/images',
      'DELETE /:id/images/:imageId',
    ],
  },
  {
    name: 'needs',
    summary: '"I NEED" — what a user wants in exchange (never itself for sale)',
    endpoints: ['GET /', 'GET /mine', 'POST /', 'GET /:id', 'PATCH /:id', 'POST /:id/status'],
  },
  {
    name: 'matches',
    summary: 'Deterministic reciprocal barter candidates (you ↔ them)',
    endpoints: ['GET /'],
  },
  {
    name: 'offers',
    summary: 'Barter proposals between two users',
    endpoints: ['POST /', 'GET /incoming', 'GET /outgoing', 'GET /:id', 'POST /:id/respond'],
  },
  {
    name: 'conversations',
    summary: 'Negotiation threads created when an offer is accepted',
    endpoints: ['GET /', 'GET /:id', 'POST /:id/read', 'GET /:id/messages', 'POST /:id/messages'],
  },
  {
    name: 'transactions',
    summary: 'Barter transactions (non-monetary) created from accepted offers',
    endpoints: ['GET /', 'GET /:id', 'POST /:id/status'],
  },
  {
    name: 'recommendations',
    summary:
      'Behavior-Based Recommendation Engine — deterministic, rule-based "Recommended For You" (no AI/ML)',
    endpoints: ['GET /'],
  },
  {
    name: 'reviews',
    summary: 'Reviews left after a completed barter transaction',
    endpoints: ['GET /users/:userId', 'POST /'],
  },
  {
    name: 'notifications',
    summary: 'Per-user notification feed and Expo push registration',
    endpoints: ['GET /', 'POST /read-all', 'POST /:id/read', 'POST /tokens', 'DELETE /tokens'],
  },
  {
    name: 'reports',
    summary: 'Abuse reports and barter-transaction disputes',
    endpoints: ['POST /', 'GET /mine', 'POST /disputes', 'GET /disputes/:transactionId'],
  },
  {
    name: 'media',
    summary: 'Reads uploaded listing photos and avatars back out of R2',
    endpoints: ['GET /*'],
  },
  {
    name: 'payments',
    summary: 'Real-money purchase of a `sale`/`both` listing via Razorpay',
    endpoints: ['POST /', 'GET /mine', 'GET /:id', 'POST /:id/cancel', 'POST /webhook'],
  },
  {
    name: 'demo-fees',
    summary:
      'DEMO ONLY — tiered platform fee on a simulated sale (no real money; off in production)',
    endpoints: ['GET /schedule', 'GET /listings', 'POST /quote', 'POST /confirm', 'GET /summary'],
  },
];

/** Route groups that talk to the database — they get the request context. */
const DB_GROUPS = [
  'auth',
  'verification',
  'users',
  'profiles',
  'categories',
  'listings',
  'needs',
  'matches',
  'offers',
  'conversations',
  'transactions',
  'recommendations',
  'reviews',
  'notifications',
  'reports',
  'payments',
  'demo-fees',
] as const;

export function createApiV1(deps: AppDeps = {}) {
  const apiV1 = new Hono<AppEnv>();

  for (const group of DB_GROUPS) {
    apiV1.use(`/${group}/*`, contextMiddleware(deps));
  }

  apiV1.get('/', (c) =>
    sendOk(c, {
      version: 'v1',
      implemented: IMPLEMENTED,
      planned: PLANNED_GROUPS.map(({ name, summary, endpoints }) => ({ name, summary, endpoints })),
      notes: [
        'Identity comes only from a verified session (HttpOnly cookie for web, Bearer token for native).',
        'Barter (listings/needs/offers/conversations/transactions/reviews) never touches money.',
        'A `sale`/`both` listing may be bought for real money via `payments` (Razorpay Payment Links) — fully separate tables and routes from barter.',
        'Listing photos and avatars live in R2; `media` serves them back and is the only unauthenticated read of uploaded content.',
        'Push notifications are a copy of a `notifications` row delivered via Expo — never the source of truth.',
        'AI matching and multi-party barter chains are explicitly out of scope for V1.',
      ],
    }),
  );

  apiV1.route('/auth', authRoute);
  apiV1.route('/verification', verificationRoute);
  apiV1.route('/users', usersRoute);
  apiV1.route('/profiles', profilesRoute);
  apiV1.route('/categories', categoriesRoute);
  apiV1.route('/listings', createMarketRoute('listing'));
  apiV1.route('/needs', createMarketRoute('need'));
  apiV1.route('/matches', matchesRoute);
  apiV1.route('/offers', offersRoute);
  apiV1.route('/conversations', conversationsRoute);
  apiV1.route('/transactions', transactionsRoute);
  apiV1.route('/recommendations', recommendationsRoute);
  apiV1.route('/reviews', reviewsRoute);
  apiV1.route('/notifications', notificationsRoute);
  apiV1.route('/reports', reportsRoute);
  apiV1.route('/payments', paymentsRoute);
  apiV1.route('/demo-fees', demoFeesRoute);
  // No context middleware: `media` only touches R2, never the database.
  apiV1.route('/media', mediaRoute);

  for (const group of PLANNED_GROUPS) {
    apiV1.route(`/${group.name}`, plannedGroupRouter(group));
  }

  return apiV1;
}
