import { boundedString, idSchema, z } from './common';

/**
 * A review is always submitted against a completed barter transaction. The
 * server additionally checks the reviewer was a party to it and has not already
 * reviewed — see the Worker's review domain module.
 */
export const createReviewSchema = z.object({
  transactionId: idSchema('btx'),
  rating: z.number().int().min(1).max(5),
  comment: boundedString(1, 2000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const transactionStatusUpdateSchema = z.object({
  /**
   * `confirm` — "the exchange happened" from the caller's side; the trade
   * completes only once BOTH parties have confirmed. `complete` is the legacy
   * name for the same thing (older app builds) — it can never complete a trade
   * on one party's say-so. `start` is a legacy no-op for pre-existing rows.
   */
  action: z.enum(['start', 'complete', 'confirm', 'cancel']),
});
export type TransactionStatusUpdateInput = z.infer<typeof transactionStatusUpdateSchema>;
