/**
 * @pandam/types — shared types used by both the Expo app and the Worker.
 *
 * Domain entity types are DERIVED from the Drizzle schema in `@pandam/database`
 * (single source of truth) and re-exported here under clean names, so app and
 * Worker never import the database package directly and never drift on shape.
 * The import targets `@pandam/database/schema` — the schema barrel only, never
 * the D1 client — so this package needs no Cloudflare/Node type deps.
 *
 * Timestamp convention: every `createdAt` / `updatedAt` / `*At` field is epoch
 * **milliseconds** (`number`), end to end — DB, domain, and JSON API. No
 * date-string conversion layer.
 */
import type {
  BarterTransactionRow,
  BarterTransactionStatus,
  CategoryRow,
  CategoryStatus,
  ConversationParticipantRow,
  ConversationRow,
  ConversationStatus,
  CredentialRow,
  DisputeRow,
  DisputeStatus,
  ItemType,
  ListingImageRow,
  ListingRow,
  MatchRow,
  MatchStatus,
  MessageRow,
  NeedRow,
  NotificationRow,
  NotificationType,
  OfferRow,
  OfferStatus,
  PaymentRow,
  PaymentStatus,
  ProfileRow,
  PublicationStatus,
  ReportReason,
  ReportRow,
  ReportStatus,
  ReportSubjectType,
  ReviewRow,
  SessionRow,
  TransactionType,
  UserRow,
  UserStatus,
  IdentityVerificationStatus,
} from '@pandam/database/schema';

/* -------------------------------------------------------------------------- */
/* Identifiers                                                                 */
/* -------------------------------------------------------------------------- */

/** ISO-8601 timestamp string (rarely needed — timestamps are epoch ms). */
export type IsoDateString = string;

/** Nominal id brand — prevents passing a UserId where a ListingId is expected. */
export type Id<TBrand extends string> = string & { readonly __brand: TBrand };

export type UserId = Id<'user'>;
export type CredentialId = Id<'credential'>;
export type SessionId = Id<'session'>;
export type ProfileId = Id<'profile'>;
export type CategoryId = Id<'category'>;
export type ListingId = Id<'listing'>;
export type PaymentId = Id<'payment'>;
export type ListingImageId = Id<'listingImage'>;
export type NeedId = Id<'need'>;
export type MatchId = Id<'match'>;
export type OfferId = Id<'offer'>;
export type ConversationId = Id<'conversation'>;
export type MessageId = Id<'message'>;
export type BarterTransactionId = Id<'barterTransaction'>;
export type ReviewId = Id<'review'>;
export type NotificationId = Id<'notification'>;
export type ReportId = Id<'report'>;
export type DisputeId = Id<'dispute'>;

/* -------------------------------------------------------------------------- */
/* Domain entities (derived from the DB schema)                                */
/* -------------------------------------------------------------------------- */

export type User = UserRow;
export type Credential = CredentialRow;
export type Session = SessionRow;
export type Profile = ProfileRow;
export type Category = CategoryRow;
export type Listing = ListingRow;
export type ListingImage = ListingImageRow;
export type Need = NeedRow;
export type Match = MatchRow;
export type Offer = OfferRow;
export type Conversation = ConversationRow;
export type ConversationParticipant = ConversationParticipantRow;
export type Message = MessageRow;
export type BarterTransaction = BarterTransactionRow;
export type Review = ReviewRow;
export type Notification = NotificationRow;
export type Report = ReportRow;
export type Dispute = DisputeRow;
export type Payment = PaymentRow;

/* -------------------------------------------------------------------------- */
/* Enum unions (derived from the DB schema)                                    */
/* -------------------------------------------------------------------------- */

export type {
  BarterTransactionStatus,
  CategoryStatus,
  ConversationStatus,
  DisputeStatus,
  ItemType,
  MatchStatus,
  NotificationType,
  OfferStatus,
  PaymentStatus,
  PublicationStatus,
  ReportReason,
  ReportStatus,
  ReportSubjectType,
  TransactionType,
  UserStatus,
  IdentityVerificationStatus,
};

/* -------------------------------------------------------------------------- */
/* API envelopes                                                              */
/* -------------------------------------------------------------------------- */

export interface ApiOk<TData> {
  ok: true;
  data: TData;
}

export interface ApiErr {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Optional field-level details, e.g. from Zod validation. */
    details?: Record<string, string[]>;
  };
}

export type ApiResponse<TData> = ApiOk<TData> | ApiErr;

/** Cursor-paginated list result. */
export interface Paginated<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export type Platform = 'ios' | 'android' | 'web';
export type Environment = 'development' | 'preview' | 'production';

/* -------------------------------------------------------------------------- */
/* Authentication (API-safe shapes — no hashes, no tokens)                     */
/* -------------------------------------------------------------------------- */

/** The subset of a user the API is allowed to return. Never includes secrets. */
export interface SafeUser {
  id: string;
  email: string;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
  /** First-time identity verification progress. Outcomes only — no ID data. */
  identityVerification: IdentityVerification;
}

export type IdentityVerificationStepStatus = 'not_started' | 'verified';

export interface IdentityVerification {
  status: IdentityVerificationStatus;
  governmentId: IdentityVerificationStepStatus;
  face: IdentityVerificationStepStatus;
}

/** A user's public profile as returned by the API. */
export type PublicProfile = Pick<
  Profile,
  | 'displayName'
  | 'username'
  | 'bio'
  | 'avatarKey'
  | 'locationCity'
  | 'locationRegion'
  | 'locationCountry'
  | 'createdAt'
  | 'updatedAt'
> & {
  /** Ready-to-fetch URL for `avatarKey`, or `null`. Clients use this rather
   *  than building a media path themselves. */
  avatarUrl: string | null;
};

/** `GET /api/v1/auth/me` payload. */
export interface AuthenticatedUser {
  user: SafeUser;
  profile: PublicProfile | null;
}

/** `POST /api/v1/auth/{register,login}` payload. `token` is for native clients;
 *  web relies on the HttpOnly cookie and can ignore it. */
export interface AuthSession {
  user: SafeUser;
  profile: PublicProfile | null;
  token: string;
  /** Epoch ms when the session expires. */
  expiresAt: number;
}

/* -------------------------------------------------------------------------- */
/* Marketplace API shapes (listings / needs / discovery / matches)            */
/* -------------------------------------------------------------------------- */

/** Public slice of a user — everything a card needs, nothing private. */
export interface OwnerRef {
  id: string;
  displayName: string;
  username: string | null;
  /** Coarse city, for "where would we meet?" — never finer than a city name. */
  locationCity: string | null;
  /** Their avatar, ready to fetch, or `null` when they have not set one. */
  avatarUrl: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

/**
 * How a listing may be acquired, plus its price when money is involved.
 * `priceAmount` is the minor currency unit (paise for INR) — an exact integer,
 * never a float. Absent (undefined) on a `need`, which is never for sale.
 */
export interface Pricing {
  transactionType: TransactionType;
  priceAmount: number | null;
  priceCurrency: string;
}

/** A listing ("I HAVE") or need ("I NEED") as returned by the API. */
export interface MarketItem {
  id: string;
  kind: 'listing' | 'need';
  ownerId: string;
  type: ItemType;
  title: string;
  description: string;
  status: PublicationStatus;
  createdAt: number;
  updatedAt: number;
  owner: OwnerRef;
  category: CategoryRef;
  /** Only present on listings — a need is never itself for sale. */
  pricing?: Pricing;
  /** Ordered photos — a listing's own, or a need's reference photos — empty until one is added. */
  images?: ItemImage[];
  /**
   * Unique-viewer count, only present on the single-item `GET /:id` response
   * (never on discover/list responses, to keep those cheap). Counts distinct
   * users who have opened this item, not raw opens.
   */
  viewCount?: number;
}

/**
 * A listing scored by the Behavior-Based Recommendation Engine (see
 * `apps/worker/src/domain/recommendations.ts`) — a `MarketItem` plus a
 * human-readable, deterministically-templated reason it was picked. Never
 * carries the raw numeric score; see that module's doc comment for why.
 */
export type RecommendedItem = MarketItem & { reason: string };

/** One uploaded listing photo. `url` is relative to the API origin. */
export interface ItemImage {
  id: string;
  url: string;
  sortOrder: number;
}

export type ListingSummary = MarketItem & { kind: 'listing' };
export type NeedSummary = MarketItem & { kind: 'need' };

/** One side of a reciprocal barter match. */
export interface MatchSide {
  user: OwnerRef;
  /** What this side HAS that the other side NEEDS. */
  have: ItemRef;
  /** What this side NEEDS that the other side HAS. */
  need: ItemRef;
}

/** `GET /api/v1/matches` item — always oriented as you ↔ them. */
export interface ReciprocalMatchView {
  /** Stable key derived from the four item ids. */
  key: string;
  you: MatchSide;
  them: MatchSide;
}

/* -------------------------------------------------------------------------- */
/* Offers — barter proposals between two users                                */
/* -------------------------------------------------------------------------- */

/** A slice of a listing small enough to show inline on an offer/transaction. */
export interface ItemRef {
  id: string;
  title: string;
  type: ItemType;
  category: CategoryRef;
  /** The item's own cover photo (first uploaded image), or `null` when it
   *  has none — a need, or a listing with no photos. Always the real,
   *  currently-stored image for this item; never a placeholder. */
  imageUrl: string | null;
}

/** `GET /api/v1/offers/*` and `POST /api/v1/offers` item, hydrated for display. */
export interface OfferView {
  id: string;
  status: OfferStatus;
  /** Always the caller's perspective: true if the caller sent it. */
  isMine: boolean;
  fromUser: OwnerRef;
  toUser: OwnerRef;
  /** The `fromUser`'s HAVE being offered. */
  offered: ItemRef;
  /** What the offer is for: the `toUser`'s HAVE, or their I NEED request. */
  requested: ItemRef;
  /** Whether `requested` is a listing (I HAVE) or a need (I NEED request). */
  requestedKind: 'listing' | 'need';
  /** Optional photo the sender attached, ready to fetch. */
  imageUrl: string | null;
  /** The trade conversation between the two parties (opens when the offer is sent). */
  conversationId: string | null;
  message: string | null;
  matchId: string | null;
  expiresAt: number | null;
  respondedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Conversations & messages                                                    */
/* -------------------------------------------------------------------------- */

export interface ConversationView {
  id: string;
  status: ConversationStatus;
  offerId: string | null;
  /** The other participant(s) — never includes the caller. */
  participants: OwnerRef[];
  lastMessage: MessageView | null;
  /** True if the caller has unread messages in this conversation. */
  unread: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  /** True if the caller sent this message. */
  isMine: boolean;
  body: string;
  /** Attached photo, ready to fetch, or `null` for a text-only message. */
  imageUrl: string | null;
  createdAt: number;
  editedAt: number | null;
}

/** `GET /api/v1/conversations/:id/typing` — whether any other participant is
 *  currently (within the server's TTL window) typing. */
export interface TypingStatusView {
  typing: boolean;
}

/* -------------------------------------------------------------------------- */
/* Barter transactions (non-monetary) & reviews                               */
/* -------------------------------------------------------------------------- */

/** `GET /api/v1/transactions/*` item — a completed offer, in progress. */
export interface BarterTransactionView {
  id: string;
  status: BarterTransactionStatus;
  offerId: string;
  /** The caller's counterpart in this trade. */
  counterparty: OwnerRef;
  /** What the caller gave and got, oriented to the caller regardless of who
   *  initiated. */
  youGave: ItemRef;
  youGot: ItemRef;
  /** Whether the caller has already reviewed this transaction. */
  reviewedByMe: boolean;
  completedAt: number | null;
  cancelledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewView {
  id: string;
  transactionId: string;
  reviewer: OwnerRef;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** Related ids (offerId, transactionId, ...), parsed from the stored JSON. */
  data: Record<string, string>;
  read: boolean;
  createdAt: number;
}

/* -------------------------------------------------------------------------- */
/* Payments — real money, via Razorpay Payment Links                          */
/* -------------------------------------------------------------------------- */

/** `POST /api/v1/payments` and `GET /api/v1/payments/*` item. */
export interface PaymentView {
  id: string;
  status: PaymentStatus;
  listing: ItemRef;
  buyer: OwnerRef;
  seller: OwnerRef;
  /** Minor currency unit (paise for INR). */
  amount: number;
  currency: string;
  /** Razorpay-hosted checkout page — open this to pay. Only present while `created`. */
  checkoutUrl: string | null;
  expiresAt: number | null;
  paidAt: number | null;
  cancelledAt: number | null;
  refundedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Platform fee — DEMO (simulated; never charges real money)                   */
/* -------------------------------------------------------------------------- */

/** One band of the fee schedule. Amounts are paise (minor units). */
export interface FeeTier {
  label: string;
  /** Inclusive lower bound. */
  minAmount: number;
  /** Inclusive upper bound, or `null` for "no upper limit" (last tier only). */
  maxAmount: number | null;
  /** Fixed platform fee for this tier, deducted from the seller's proceeds. */
  feeAmount: number;
  /** When false the band still exists but charges no fee. */
  enabled: boolean;
}

export interface FeeSchedule {
  /** `sample` = built-in demo tiers; `env` = `PLATFORM_FEE_TIERS` override. */
  source: 'sample' | 'env';
  tiers: FeeTier[];
  errors: string[];
  valid: boolean;
}

/** `POST /api/v1/demo-fees/quote` — the authoritative fee breakdown. */
export interface DemoFeeQuote {
  demo: true;
  currency: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  tierIndex: number;
  tier: FeeTier;
  listing: { id: string; title: string } | null;
}

export interface DemoFeeTransactionView {
  id: string;
  demo: true;
  status: 'simulated_paid';
  currency: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  tierLabel: string;
  listing: { id: string | null; title: string | null };
  createdAt: number;
}

export interface DemoSaleListing {
  id: string;
  title: string;
  amount: number;
  currency: string;
}

export interface DemoRevenueSummary {
  demo: true;
  currency: string;
  count: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  byTier: { tierLabel: string; count: number; feeAmount: number }[];
  recent: DemoFeeTransactionView[];
}
