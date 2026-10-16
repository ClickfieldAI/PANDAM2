/**
 * `/api/v1/demo-fees` — client-demo platform fee on a SIMULATED sale.
 *
 *   GET  /schedule   the active tier schedule (read-only; edited via env)
 *   GET  /listings   published `sale`/`both` listings a demo can use
 *   POST /quote      authoritative fee breakdown for a listing or an amount
 *   POST /confirm    simulate a successful payment and record the fee (DEMO)
 *   GET  /summary    platform fee revenue earned from simulated transactions
 *
 * Safety: nothing here calls Razorpay or moves money. Every row is flagged
 * `is_demo` (CHECK-enforced), the fee is always recomputed server-side (a
 * client-supplied fee is never trusted), and the whole group refuses to run
 * when `PANDAM_ENV` is `production`. Real purchases remain exclusively in
 * `/api/v1/payments`.
 */
import {
  type DemoFeeQuote,
  type DemoFeeTransactionView,
  type DemoRevenueSummary,
  type DemoSaleListing,
} from '@pandam/types';
import { demoFeeConfirmSchema, demoFeeQuoteSchema } from '@pandam/validation';
import { type Context, Hono } from 'hono';

import { FeeCalculationError, calculateFee, loadFeeSchedule } from '../../../domain/platform-fee';
import { ApiError, sendOk } from '../../../lib/http';
import { parseBody } from '../../../lib/validate';
import { authMiddleware, requireAuth } from '../../../middleware/auth';
import { type AppEnv } from '../../../types';

export const demoFeesRoute = new Hono<AppEnv>();

/** The demo must never run against a production deployment. */
demoFeesRoute.use('*', async (c, next) => {
  if (c.env?.PANDAM_ENV === 'production') {
    throw new ApiError('forbidden', 'The platform-fee demo is disabled in production.');
  }
  await next();
});
demoFeesRoute.use('*', authMiddleware, requireAuth);

function activeSchedule(c: Context<AppEnv>) {
  const { env } = c.get('ctx');
  const schedule = loadFeeSchedule(env.PLATFORM_FEE_TIERS);
  if (!schedule.valid) {
    throw new ApiError(
      'unprocessable',
      'The configured fee schedule is invalid, so no fee can be quoted.',
      { schedule: schedule.errors },
    );
  }
  return schedule;
}

async function buildQuote(
  c: Context<AppEnv>,
  input: { listingId?: string | undefined; amount?: number | undefined },
): Promise<DemoFeeQuote> {
  const { repos } = c.get('ctx');
  const schedule = activeSchedule(c);

  let amount = input.amount ?? 0;
  let currency = 'INR';
  let listing: DemoFeeQuote['listing'] = null;
  if (input.listingId) {
    const row = await repos.listings.findById(input.listingId);
    if (!row || row.status !== 'published') {
      throw new ApiError('not_found', 'That listing is not available.');
    }
    if (row.transactionType === 'barter' || row.priceAmount === null) {
      throw new ApiError('unprocessable', 'That listing is barter-only, so it has no sale amount.');
    }
    amount = row.priceAmount;
    currency = row.priceCurrency;
    listing = { id: row.id, title: row.title };
  }

  try {
    const calc = calculateFee(amount, schedule.tiers);
    return {
      demo: true,
      currency,
      amount: calc.amount,
      feeAmount: calc.feeAmount,
      netAmount: calc.netAmount,
      tierIndex: calc.tierIndex,
      tier: calc.tier,
      listing,
    };
  } catch (e) {
    if (e instanceof FeeCalculationError) throw new ApiError('unprocessable', e.message);
    throw e;
  }
}

demoFeesRoute.get('/schedule', (c) =>
  sendOk(c, {
    demo: true,
    currency: 'INR',
    schedule: loadFeeSchedule(c.get('ctx').env.PLATFORM_FEE_TIERS),
  }),
);

demoFeesRoute.get('/listings', async (c) => {
  const { repos } = c.get('ctx');
  const rows = await repos.demoFeeTransactions.saleListings(50);
  const items: DemoSaleListing[] = rows
    .filter((r) => r.priceAmount !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      amount: r.priceAmount as number,
      currency: r.priceCurrency,
    }));
  return sendOk(c, { items });
});

demoFeesRoute.post('/quote', async (c) => {
  const input = await parseBody(c, demoFeeQuoteSchema);
  return sendOk(c, { quote: await buildQuote(c, input) });
});

function toView(row: {
  id: string;
  currency: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  tierLabel: string;
  listingId: string | null;
  listingTitle: string | null;
  createdAt: number;
}): DemoFeeTransactionView {
  return {
    id: row.id,
    demo: true,
    status: 'simulated_paid',
    currency: row.currency,
    amount: row.amount,
    feeAmount: row.feeAmount,
    netAmount: row.netAmount,
    tierLabel: row.tierLabel,
    listing: { id: row.listingId, title: row.listingTitle },
    createdAt: row.createdAt,
  };
}

demoFeesRoute.post('/confirm', async (c) => {
  const { repos } = c.get('ctx');
  const auth = c.get('auth');
  if (!auth) throw new ApiError('unauthorized', 'Sign in first.');
  const input = await parseBody(c, demoFeeConfirmSchema);

  // Recompute from authoritative data; the client's number is only a staleness check.
  const quote = await buildQuote(c, input);
  if (quote.feeAmount !== input.expectedFeeAmount) {
    throw new ApiError(
      'conflict',
      'The platform fee changed since you reviewed it. Review the updated amount and confirm again.',
      { feeAmount: [String(quote.feeAmount)] },
    );
  }

  const schedule = activeSchedule(c);
  const { row, created } = await repos.demoFeeTransactions.createOnce({
    userId: auth.user.id,
    listingId: quote.listing?.id ?? null,
    listingTitle: quote.listing?.title ?? null,
    currency: quote.currency,
    amount: quote.amount,
    feeAmount: quote.feeAmount,
    netAmount: quote.netAmount,
    tierLabel: quote.tier.label,
    feeSchedule: JSON.stringify({ source: schedule.source, tiers: schedule.tiers }),
    idempotencyKey: input.idempotencyKey,
  });

  // A reused key with a different amount is a client bug — never silently return
  // a transaction for a different sale.
  if (!created && (row.amount !== quote.amount || row.listingId !== (quote.listing?.id ?? null))) {
    throw new ApiError('conflict', 'That idempotency key was already used for a different sale.');
  }

  return sendOk(c, { transaction: toView(row), replayed: !created }, created ? 201 : 200);
});

demoFeesRoute.get('/summary', async (c) => {
  const { repos } = c.get('ctx');
  const [totals, byTier, recent] = await Promise.all([
    repos.demoFeeTransactions.totals(),
    repos.demoFeeTransactions.byTier(),
    repos.demoFeeTransactions.recent(10),
  ]);
  const summary: DemoRevenueSummary = {
    demo: true,
    currency: 'INR',
    count: totals.count,
    grossAmount: totals.grossAmount,
    feeAmount: totals.feeAmount,
    netAmount: totals.netAmount,
    byTier,
    recent: recent.map(toView),
  };
  return sendOk(c, { summary });
});
