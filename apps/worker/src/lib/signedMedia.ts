/**
 * Signed URLs for PRIVATE chat media (`messages/…` objects).
 *
 * Listing photos and avatars are public; a photo, video or thumbnail sent in a chat is not.
 * Only the people in the conversation may fetch it, so the media route refuses a `messages/`
 * key unless the request carries a valid signature. The signature is minted only by the
 * message endpoints, after they have checked the caller belongs to the conversation, so
 * "can fetch the file" follows "may read the message".
 *
 * A URL is `…/api/v1/media/<key>?exp=<epoch ms>&sig=<hex HMAC-SHA256 of "<key>.<exp>">`.
 * `exp` is rounded to the hour, so the URL for a given file stays byte-identical while the
 * app polls (images are not re-downloaded on every refresh) yet is valid for at least an hour.
 */
import { type Env } from '../env';

import { ApiError } from './http';
import { mediaUrl } from './media';

/** Everything under this prefix in the bucket is private to a conversation. */
export const PRIVATE_MEDIA_PREFIX = 'messages/';

type SigningEnv = Pick<Env, 'MEDIA_URL_SECRET' | 'PANDAM_ENV'>;

const HOUR_MS = 3_600_000;
/** A URL is valid for between 1 and 2 hours from when it was issued. */
const VALID_HOURS = 2;

const DEV_FALLBACK_SECRET = 'pandam-local-development-media-secret';

function secretFor(env: SigningEnv): string {
  if (env.MEDIA_URL_SECRET) return env.MEDIA_URL_SECRET;
  if (env.PANDAM_ENV === 'development') return DEV_FALLBACK_SECRET;
  throw new ApiError(
    'internal_error',
    'Private media signing is not configured on this server (MEDIA_URL_SECRET is missing).',
  );
}

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** Constant-time string comparison, so a wrong signature leaks nothing about a right one. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isPrivateMediaKey(key: string): boolean {
  return key.startsWith(PRIVATE_MEDIA_PREFIX);
}

/** An API-relative URL the holder can use to fetch `key` for the next one to two hours. */
export async function signedMediaUrl(
  env: SigningEnv,
  key: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const exp = (Math.floor(nowMs / HOUR_MS) + VALID_HOURS) * HOUR_MS;
  const sig = await hmac(secretFor(env), `${key}.${exp}`);
  return `${mediaUrl(key)}?exp=${exp}&sig=${sig}`;
}

/** True only for an unexpired, untampered signature for exactly this key. */
export async function verifyMediaSignature(
  env: SigningEnv,
  key: string,
  exp: string | null | undefined,
  sig: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!exp || !sig || !/^\d{10,16}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(exp) < nowMs) return false;
  return safeEqual(await hmac(secretFor(env), `${key}.${exp}`), sig);
}
