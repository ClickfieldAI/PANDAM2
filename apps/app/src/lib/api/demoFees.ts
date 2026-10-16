import {
  type DemoFeeQuote,
  type DemoFeeTransactionView,
  type DemoRevenueSummary,
  type DemoSaleListing,
  type FeeSchedule,
} from '@pandam/types';
import { type DemoFeeConfirmInput, type DemoFeeQuoteInput } from '@pandam/validation';

import { api } from './client';

/** DEMO ONLY — simulated sales + platform fee. Never charges real money. */
export const demoFeesApi = {
  schedule: () =>
    api.get<{ demo: true; currency: string; schedule: FeeSchedule }>('/api/v1/demo-fees/schedule'),
  listings: () => api.get<{ items: DemoSaleListing[] }>('/api/v1/demo-fees/listings'),
  quote: (input: DemoFeeQuoteInput) =>
    api.post<{ quote: DemoFeeQuote }>('/api/v1/demo-fees/quote', input),
  confirm: (input: DemoFeeConfirmInput) =>
    api.post<{ transaction: DemoFeeTransactionView; replayed: boolean }>(
      '/api/v1/demo-fees/confirm',
      input,
    ),
  summary: () => api.get<{ summary: DemoRevenueSummary }>('/api/v1/demo-fees/summary'),
};
