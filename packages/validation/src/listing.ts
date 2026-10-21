import {
  boundedString,
  currencySchema,
  idSchema,
  itemTypeSchema,
  priceAmountSchema,
  publishableStatusSchema,
  transactionTypeSchema,
  z,
} from './common';
import { phoneSchema } from './phone';

export const createListingSchema = z
  .object({
    categoryId: idSchema('cat'),
    type: itemTypeSchema,
    title: boundedString(3, 120),
    description: boundedString(10, 4000),
    /** Optional; defaults to `draft` server-side. */
    status: publishableStatusSchema.optional(),
    /** Optional; defaults to `barter` server-side. */
    transactionType: transactionTypeSchema.optional(),
    priceAmount: priceAmountSchema.optional(),
    priceCurrency: currencySchema.optional(),
    /**
     * The poster's mobile number (E.164 after parsing). Required unless the account already has
     * one saved; the route enforces that, since the schema cannot see the profile. Private: it is
     * never returned in listing responses.
     */
    phone: phoneSchema.optional(),
  })
  .superRefine((v, ctx) => {
    // A create always fully determines transactionType (defaulting to
    // 'barter' server-side), so the price requirement can be checked directly.
    const type = v.transactionType ?? 'barter';
    if (type !== 'barter' && v.priceAmount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceAmount'],
        message: 'a price is required for a sale or "both" listing',
      });
    }
    if (type === 'barter' && v.priceAmount !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceAmount'],
        message: 'a barter listing cannot have a price',
      });
    }
  });
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = z
  .object({
    categoryId: idSchema('cat'),
    type: itemTypeSchema,
    title: boundedString(3, 120),
    description: boundedString(10, 4000),
    transactionType: transactionTypeSchema,
    priceAmount: priceAmountSchema,
    priceCurrency: currencySchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field is required' })
  .superRefine((v, ctx) => {
    // A patch only knows the fields it carries — whether the OTHER side of the
    // barter/price pair is consistent depends on the row already in the
    // database, which this schema cannot see. Only the two cases fully
    // determined by the patch itself are checked here; the route layer
    // resolves the rest against the current row (and clears/requires price
    // when `transactionType` actually changes).
    if (v.transactionType === 'barter' && v.priceAmount !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceAmount'],
        message: 'a barter listing cannot have a price',
      });
    }
    if (
      (v.transactionType === 'sale' || v.transactionType === 'both') &&
      v.priceAmount === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceAmount'],
        message: 'switching to sale or "both" requires a price in the same request',
      });
    }
  });
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const setListingStatusSchema = z.object({ status: publishableStatusSchema });
export type SetListingStatusInput = z.infer<typeof setListingStatusSchema>;

/*
 * There is deliberately no schema for attaching an image: photos are uploaded
 * as `multipart/form-data` and the object key is generated server-side (see
 * `apps/worker/src/lib/media.ts`), so a client never sends image metadata for
 * validation. A schema here would imply the client can choose the key.
 */
