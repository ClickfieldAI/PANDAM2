import { boundedString, idSchema, z } from './common';

/**
 * Create a barter offer: "I give you my `offeredListingId` for your
 * `requestedListingId`". `matchId` is optional (offers can also be made
 * straight from search).
 */
export const createOfferSchema = z
  .object({
    /**
     * Optional and only ever CHECKED, never trusted: the recipient is always
     * the owner of the requested item, resolved server-side.
     */
    toUserId: idSchema('usr').optional(),
    offeredListingId: idSchema('lst'),
    /** Offer for someone's HAVE (a listing)… */
    requestedListingId: idSchema('lst').optional(),
    /** …or for someone's I NEED request. Exactly one of the two. */
    requestedNeedId: idSchema('ned').optional(),
    /** Key returned by `POST /offers/attachments` (the sender's own upload). */
    imageKey: z.string().min(1).max(300).optional(),
    matchId: idSchema('mch').optional(),
    message: boundedString(1, 2000).optional(),
    /** Epoch-ms; must be in the future when present. */
    expiresAt: z.number().int().positive().optional(),
  })
  .refine((v) => !!v.requestedListingId !== !!v.requestedNeedId, {
    message: 'offer either a listing or a request, not both',
    path: ['requestedListingId'],
  });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

/** The recipient's response, or the sender cancelling. */
export const respondToOfferSchema = z.object({
  action: z.enum(['accept', 'reject', 'cancel']),
});
export type RespondToOfferInput = z.infer<typeof respondToOfferSchema>;

/**
 * The recipient answers an offer with a different swap: "I will give THIS of
 * mine for THAT of yours". Both ends are listings (item-for-item); the server
 * checks that `offeredListingId` is the caller's and `requestedListingId`
 * belongs to the original sender.
 */
export const counterOfferSchema = z.object({
  offeredListingId: idSchema('lst'),
  requestedListingId: idSchema('lst'),
  message: boundedString(1, 2000).optional(),
  /** Epoch-ms; must be in the future when present. */
  expiresAt: z.number().int().positive().optional(),
});
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
