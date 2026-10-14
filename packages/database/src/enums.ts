/**
 * Canonical enum value tuples for the PANDAM domain — the single source of
 * truth for every `status` / `type` union.
 *
 * This module imports NOTHING (no Drizzle, no Cloudflare) so it can be consumed
 * by `@pandam/validation` and the Expo app without pulling the database driver
 * into the client bundle. The schema files (`./schema/*`) import their `enum:`
 * options from here; nothing defines these tuples twice.
 */

export const USER_STATUS = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

/** Social sign-in providers PANDAM accepts, beyond email+password. */
export const OAUTH_PROVIDER = ['google', 'apple'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDER)[number];

/**
 * First-time identity verification. `in_progress` = at least one step done;
 * `verified` = every required step done. Only ever moves forward.
 */
export const IDENTITY_VERIFICATION_STATUS = ['not_started', 'in_progress', 'verified'] as const;
export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUS)[number];

export const CATEGORY_STATUS = ['active', 'inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUS)[number];

/** What is offered ("I HAVE") or wanted ("I NEED"). */
export const ITEM_TYPE = ['product', 'service', 'skill'] as const;
export type ItemType = (typeof ITEM_TYPE)[number];

/** Which of the two parallel tables an item lives in — a listing or a need. */
export const ITEM_KIND = ['listing', 'need'] as const;
export type ItemKind = (typeof ITEM_KIND)[number];

/**
 * Publication lifecycle shared by listings and needs. Only `published` matches.
 * `sold` = consumed via a real-money payment (see `payments.ts`); `traded` =
 * consumed via an accepted barter offer; `archived` = manually unlisted by the
 * owner with no transaction behind it. All three are terminal and excluded
 * from discovery/matching the same way.
 */
export const PUBLICATION_STATUS = [
  'draft',
  'published',
  'paused',
  'sold',
  'traded',
  'archived',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUS)[number];

export const MATCH_STATUS = ['candidate', 'dismissed'] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export const OFFER_STATUS = ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUS)[number];

export const CONVERSATION_STATUS = ['active', 'archived'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUS)[number];

export const CONVERSATION_ROLE = ['member'] as const;
export type ConversationRole = (typeof CONVERSATION_ROLE)[number];

export const BARTER_TRANSACTION_STATUS = [
  'created',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
] as const;
export type BarterTransactionStatus = (typeof BARTER_TRANSACTION_STATUS)[number];

export const NOTIFICATION_TYPE = [
  'offer_received',
  'offer_accepted',
  'offer_rejected',
  'offer_cancelled',
  'offer_expired',
  'message_received',
  'transaction_updated',
  'review_reminder',
  'review_received',
  'need_match',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

/**
 * Photos allowed per listing. Enforced by the upload route and used by the
 * form to stop offering an "add" tile that would be rejected. Lives here
 * because this module is the dependency-free leaf both sides can import.
 */
export const MAX_LISTING_IMAGES = 6;

export const PUSH_PLATFORM = ['ios', 'android', 'web'] as const;
export type PushPlatform = (typeof PUSH_PLATFORM)[number];

export const REPORT_SUBJECT_TYPE = ['user', 'listing', 'need', 'message', 'transaction'] as const;
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPE)[number];

export const REPORT_REASON = ['spam', 'harassment', 'scam', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASON)[number];

export const REPORT_STATUS = ['open', 'reviewing', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

export const DISPUTE_STATUS = ['open', 'reviewing', 'resolved', 'rejected'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUS)[number];

/**
 * How a listing ("I HAVE") may be acquired. `barter` is the V1 default and the
 * only mode `needs` matching considers; `sale` and `both` opt a listing into
 * real-money checkout via Razorpay. This is additive — nothing about the
 * existing barter/offer/match machinery changes for a `barter` listing.
 */
export const TRANSACTION_TYPE = ['barter', 'sale', 'both'] as const;
export type TransactionType = (typeof TRANSACTION_TYPE)[number];

/**
 * Lifecycle of a real-money payment for a listing, backed by a Razorpay
 * Payment Link (see `apps/worker/src/lib/razorpay.ts`). This is fully separate
 * from `barter_transactions` — a good/service exchanged for money never
 * touches the barter tables, and a barter never touches this one.
 *
 *   created ─▶ paid          (webhook: payment_link.paid)
 *      │  └──▶ expired       (webhook: payment_link.expired, or past expiry)
 *      └────▶ cancelled      (buyer/seller cancels before paying)
 *   paid  ─▶ refunded        (seller-initiated refund via Razorpay)
 */
export const PAYMENT_STATUS = ['created', 'paid', 'expired', 'cancelled', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
