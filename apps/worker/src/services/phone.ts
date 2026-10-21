/**
 * The poster's mobile number, required whenever someone lists something or posts a request.
 *
 * The number lives on the profile (`profiles.phone_e164`), one per account, so a person types
 * it once and every later listing reuses it. A request that supplies a number updates the
 * profile's; one that does not falls back to what is saved; with neither, it is refused.
 * Format validation (E.164) already happened in the shared Zod schema, so `supplied` here is
 * either undefined or a normalised number.
 *
 * The number is private: nothing in a listing, search or profile response carries it.
 */
import { type Context } from 'hono';

import { ApiError } from '../lib/http';
import { type AppEnv } from '../types';

type Ctx = Context<AppEnv>;

/** The number to use for this post, or a 422 `validation_error` naming the `phone` field. */
export async function requirePosterPhone(
  c: Ctx,
  userId: string,
  supplied: string | undefined,
): Promise<{ phone: string; changed: boolean }> {
  const profile = await c.get('ctx').repos.profiles.findByUserId(userId);
  const saved = profile?.phoneE164 ?? null;
  const phone = supplied ?? saved;
  if (!phone) {
    throw new ApiError(
      'validation_error',
      'Add your mobile number so the people you trade with can reach you.',
      { phone: ['is required'] },
    );
  }
  return { phone, changed: phone !== saved };
}

/** Save a number that was newly supplied (call after the post itself succeeded). */
export async function savePosterPhone(
  c: Ctx,
  userId: string,
  poster: { phone: string; changed: boolean },
): Promise<void> {
  if (!poster.changed) return;
  await c.get('ctx').repos.profiles.update(userId, { phoneE164: poster.phone });
}
