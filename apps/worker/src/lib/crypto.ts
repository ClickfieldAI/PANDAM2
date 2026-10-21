/**
 * Password + session-token cryptography for the PANDAM API.
 *
 * Everything here uses the Web Crypto API (`crypto` / `crypto.subtle`), which is
 * available in the Cloudflare Workers runtime and in Node >= 20 — no
 * dependency, and identical behaviour in tests.
 *
 * Password hashing: PBKDF2-HMAC-SHA-256, applied in TWO chained rounds of
 * `PBKDF2_ROUND_ITERATIONS` each (see below for why). The hash string is
 * self-describing:
 *
 *   pbkdf2x2$sha256$<iterationsPerRound>$<salt1_b64url>$<salt2_b64url>$<hash_b64url>
 *
 * An older single-round format is still readable (never written):
 *
 *   pbkdf2$sha256$<iterations>$<salt_b64url>$<hash_b64url>
 *
 * so `PBKDF2_ROUND_ITERATIONS` can be raised later and `needsRehash()` will
 * ask the login flow to transparently re-hash into the current scheme. See
 * docs/architecture/auth.md and docs/decisions/0003-authentication-and-sessions.md.
 *
 * --- Why two rounds, and why 100,000 ---
 *
 * The Cloudflare Workers runtime (workerd) enforces a PBKDF2 iteration cap on
 * `crypto.subtle.deriveBits` that is NOT part of the Web Crypto spec and is
 * NOT documented on developers.cloudflare.com — it is only visible in
 * workerd's own source (`src/workerd/io/limit-enforcer.h`):
 *
 *   static constexpr size_t DEFAULT_MAX_PBKDF2_ITERATIONS = 100'000;
 *
 * ...with the engine's own comment calling that limit "WAY below the
 * recommended minimum iterations for pbkdf2". A single call above it throws
 * `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not
 * supported` — confirmed against the real deployed `pandam-api-staging`
 * Worker, not just locally (local `workerd`/Miniflare test harnesses use a
 * different `LimitEnforcer` override that does not apply this cap, which is
 * why a local-only test can pass while the hosted Worker fails).
 *
 * Two chained PBKDF2 calls (round 2 derives from round 1's raw output, with
 * its own independent salt) stay within that confirmed, enforced ceiling
 * while keeping a comparable total work factor to a single larger call.
 * This is NOT a standardized construction (no RFC/NIST spec covers chained
 * PBKDF2 the way RFC 8018 covers a single call) — treat it as a pragmatic,
 * Workers-compatible mitigation, not a drop-in equivalent to one 200,000-
 * iteration call. An attacker still must perform both rounds per guess.
 */

/** Per-round work factor — must stay <= workerd's enforced cap (100,000; see
 *  file header). Embedded in every new hash so it can be tuned later. */
export const PBKDF2_ROUND_ITERATIONS = 100_000;
/**
 * Hard ceiling on any iteration count read back out of a *stored* hash
 * (legacy or current), independent of `PBKDF2_ROUND_ITERATIONS`. A stored
 * value above this is refused outright — never clamped down and silently
 * used — because clamping would quietly verify against a weaker work factor
 * than the hash was actually created with, and because calling
 * `crypto.subtle.deriveBits` with a value the Workers runtime itself
 * rejects (see file header) would throw instead of failing a login cleanly.
 */
const MAX_VERIFIABLE_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/** Current (written) format: two chained PBKDF2-HMAC-SHA-256 rounds. */
const HASH_PREFIX_X2 = 'pbkdf2x2$sha256$';
/** Legacy format: a single PBKDF2-HMAC-SHA-256 call. Still verified, never written. */
const HASH_PREFIX_LEGACY = 'pbkdf2$sha256$';

const encoder = new TextEncoder();

function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** One PBKDF2-HMAC-SHA-256 call over raw key-material bytes. */
async function pbkdf2Bits(
  keyMaterialBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    keyMaterialBytes as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations },
    keyMaterial,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** One PBKDF2-HMAC-SHA-256 call over a plaintext password (legacy path). */
function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Bits(encoder.encode(password), salt, iterations);
}

/** Two chained PBKDF2-HMAC-SHA-256 calls, each within the Workers-enforced cap. */
async function pbkdf2x2(
  password: string,
  salt1: Uint8Array,
  salt2: Uint8Array,
  iterationsPerRound: number,
): Promise<Uint8Array> {
  const round1 = await pbkdf2Bits(encoder.encode(password), salt1, iterationsPerRound);
  return pbkdf2Bits(round1, salt2, iterationsPerRound);
}

/** Constant-time comparison of two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Hash a plaintext password. The plaintext is never stored or logged. */
export async function hashPassword(password: string): Promise<string> {
  const salt1 = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt2 = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2x2(password, salt1, salt2, PBKDF2_ROUND_ITERATIONS);
  return `${HASH_PREFIX_X2}${PBKDF2_ROUND_ITERATIONS}$${toB64Url(salt1)}$${toB64Url(salt2)}$${toB64Url(hash)}`;
}

/**
 * Verify a plaintext password against a stored hash string (either format).
 *
 * Deliberately paranoid about the stored value: it is server-generated and
 * never client-supplied, but this still treats it as untrusted input. Any
 * parse failure, out-of-range iteration count, or malformed Base64URL field
 * returns `false` (a clean, ordinary "wrong credentials" outcome) rather
 * than throwing — a thrown exception here would surface as a 500 on login,
 * which is exactly the failure class this whole fix exists to eliminate.
 * Iteration counts above `MAX_VERIFIABLE_ITERATIONS` are REJECTED, never
 * clamped — a stored hash above that ceiling could not have been produced
 * by `crypto.subtle.deriveBits` on the actual Workers runtime anyway (see
 * file header), so refusing it here fails cleanly instead of throwing.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith(HASH_PREFIX_X2)) {
      const rest = stored.slice(HASH_PREFIX_X2.length);
      const [iterStr, salt1Str, salt2Str, hashStr] = rest.split('$');
      if (!iterStr || !salt1Str || !salt2Str || !hashStr) return false;
      const iterations = Number.parseInt(iterStr, 10);
      if (
        !Number.isFinite(iterations) ||
        iterations < 1 ||
        iterations > MAX_VERIFIABLE_ITERATIONS
      ) {
        return false;
      }
      const candidate = await pbkdf2x2(
        password,
        fromB64Url(salt1Str),
        fromB64Url(salt2Str),
        iterations,
      );
      return timingSafeEqual(candidate, fromB64Url(hashStr));
    }

    if (stored.startsWith(HASH_PREFIX_LEGACY)) {
      const rest = stored.slice(HASH_PREFIX_LEGACY.length);
      const [iterStr, saltStr, hashStr] = rest.split('$');
      if (!iterStr || !saltStr || !hashStr) return false;
      const iterations = Number.parseInt(iterStr, 10);
      if (
        !Number.isFinite(iterations) ||
        iterations < 1 ||
        iterations > MAX_VERIFIABLE_ITERATIONS
      ) {
        return false;
      }
      const candidate = await pbkdf2(password, fromB64Url(saltStr), iterations);
      return timingSafeEqual(candidate, fromB64Url(hashStr));
    }

    return false;
  } catch {
    // Malformed Base64URL (fromB64Url -> atob) or any other decode/derive
    // failure on an untrusted-shaped stored value. Never let this surface
    // as an uncaught exception from a login attempt.
    return false;
  }
}

/** True when a stored hash is not in the current two-round scheme, or is
 *  below the current per-round work factor (covers both the legacy format
 *  and a future bump of `PBKDF2_ROUND_ITERATIONS`). */
export function needsRehash(stored: string): boolean {
  if (!stored.startsWith(HASH_PREFIX_X2)) return true;
  const iterStr = stored.slice(HASH_PREFIX_X2.length).split('$')[0];
  const iterations = Number.parseInt(iterStr ?? '0', 10);
  return !Number.isFinite(iterations) || iterations < PBKDF2_ROUND_ITERATIONS;
}

/* ------------------------------ session tokens ----------------------------- */

const TOKEN_BYTES = 32;

/** A fresh, URL-safe 256-bit session token. Shown to the client exactly once. */
export function generateSessionToken(): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256(token) as lowercase hex — this is what the `sessions` table stores. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
