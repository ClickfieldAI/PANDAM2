import { idSchema, z } from './common';

/** Whole paise (minor units), at least 1. The server enforces the upper bound. */
const amountSchema = z.number().int().min(1);

/** Quote a fee for an existing sale listing OR a typed demo amount — exactly one. */
export const demoFeeQuoteSchema = z
  .object({
    listingId: idSchema('lst').optional(),
    amount: amountSchema.optional(),
  })
  .refine((v) => (v.listingId === undefined) !== (v.amount === undefined), {
    message: 'Provide either listingId or amount, not both.',
  });
export type DemoFeeQuoteInput = z.infer<typeof demoFeeQuoteSchema>;

/**
 * Confirm a simulated payment. `expectedFeeAmount` is what the user was shown;
 * it is only a staleness check — the server never trusts it as the fee.
 */
export const demoFeeConfirmSchema = z
  .object({
    listingId: idSchema('lst').optional(),
    amount: amountSchema.optional(),
    expectedFeeAmount: z.number().int().min(0),
    idempotencyKey: z.string().min(8).max(80),
  })
  .refine((v) => (v.listingId === undefined) !== (v.amount === undefined), {
    message: 'Provide either listingId or amount, not both.',
  });
export type DemoFeeConfirmInput = z.infer<typeof demoFeeConfirmSchema>;
