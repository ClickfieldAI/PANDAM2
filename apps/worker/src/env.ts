/**
 * Worker runtime bindings. `PANDAM_ENV` and `DB` are wired up; the rest are
 * optional so route code can target the final shape while their wrangler.jsonc
 * bindings are still commented out.
 *
 * The Hono generic every router uses is `AppEnv` (see `./types.ts`), which adds
 * the middleware-set `Variables` (`ctx`, `auth`) on top of these `Bindings`.
 */
export interface Env {
  /** Plain var from wrangler.jsonc. */
  PANDAM_ENV: 'development' | 'preview' | 'production';

  /**
   * Comma-separated list of browser origins allowed to send credentialed
   * requests (cookies). Defaults to the local Expo web/dev-tools origins.
   */
  CORS_ORIGINS?: string;

  /** Secret (apps/worker/.dev.vars locally). Crash reports go here; unset = reporting is off. */
  SENTRY_DSN?: string;
  /** Optional build/version label attached to crash reports (e.g. a git sha). */
  RELEASE?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;

  /**
   * Razorpay (real-money payments for `sale`/`both` listings — see
   * `lib/razorpay.ts` and `routes/api/v1/payments.ts`). All three are
   * secrets; absent in dev until a Razorpay account is connected, in which
   * case `/api/v1/payments` returns `503 db_unavailable`-style errors rather
   * than silently pretending to charge anyone.
   *  - KEY_ID / KEY_SECRET: HTTP Basic auth for the Payment Links API.
   *  - WEBHOOK_SECRET: HMAC-SHA256 key Razorpay signs webhook bodies with —
   *    the ONLY thing that is ever trusted to mark a payment `paid`.
   */
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;

  /**
   * Platform-fee tier schedule for the client DEMO — a JSON array of
   * { label, minAmount, maxAmount|null, feeAmount, enabled } in paise.
   * Unset = the built-in SAMPLE tiers (see domain/platform-fee.ts). Not
   * client-approved commercial rates.
   */
  PLATFORM_FEE_TIERS?: string;

  /**
   * Expo push access token. Optional: Expo only requires it once "enhanced
   * push security" is switched on for the project. Without it, sends are
   * unauthenticated and still delivered. See `lib/push.ts`.
   */
  EXPO_ACCESS_TOKEN?: string;

  /**
   * "Sign in with Google/Apple" — see `lib/oauth.ts` and
   * `services/auth.ts#loginWithOAuth`. Not secrets (they are OAuth *client*
   * ids, which are public by design — the security boundary is the provider's
   * signature on the ID token, verified against their published JWKS), but
   * kept out of `vars` since they are still deployment-specific.
   *
   *  - GOOGLE_OAUTH_CLIENT_IDS: comma-separated. One PANDAM project has a
   *    separate OAuth client per platform (Web, iOS, Android) in Google Cloud
   *    Console; every one of their client ids must be accepted as a valid
   *    `aud` on the ID token, so all of them go in this one list.
   *  - APPLE_OAUTH_AUDIENCES: comma-separated. Apple's `aud` is the iOS app's
   *    bundle id for a native sign-in and the "Services ID" for web — both
   *    belong in this list.
   *
   * Without these set, `/api/v1/auth/oauth` returns a clear `not_implemented`
   * rather than silently accepting a token it cannot actually verify.
   */
  GOOGLE_OAUTH_CLIENT_IDS?: string;
  APPLE_OAUTH_AUDIENCES?: string;

  /** D1 — enabled once the d1_databases binding is uncommented. */
  DB?: D1Database;
  /** R2 — enabled once the r2_buckets binding is uncommented. */
  MEDIA?: R2Bucket;
  /** Durable Object namespace — enabled once the binding is uncommented. */
  CONVERSATION?: DurableObjectNamespace;
  /** Queue producer — enabled once the binding is uncommented. */
  JOBS?: Queue<unknown>;
}
