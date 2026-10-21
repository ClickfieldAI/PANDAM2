/**
 * Mobile numbers: one normal form, and the links built from it.
 *
 * A number is stored (and sent over the API) in E.164: `+` then the country code and the
 * subscriber number, digits only, 8 to 15 digits in all (e.g. `+919876543210`). Everything
 * else — spaces, dashes, brackets, a leading `00` — is accepted on input and stripped.
 *
 * This module is pure (no React Native, no Zod import cycle) so the app forms, the Worker
 * routes and the tests all use exactly the same rules.
 */
import { z } from './common';

const E164 = /^\+[1-9]\d{7,14}$/;

/** Everything people commonly type into a phone field, reduced to `+digits`; null if unusable. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s) return null;
  // Only digits and the usual separators are allowed; letters etc. make it invalid outright.
  if (/[^\d\s()\-.+]/.test(s)) return null;
  const hasPlus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!hasPlus && s.startsWith('00')) s = s.slice(2);
  else if (!hasPlus) return null; // no country code: refuse to guess one
  const e164 = `+${s}`;
  return E164.test(e164) ? e164 : null;
}

/**
 * Combine a country dial code (`+91`, `91`) and the number as typed (`98765 43210`,
 * `098765 43210`) into E.164. A national trunk prefix `0` is dropped. Null if invalid.
 */
export function buildPhone(dialCode: string, national: string): string | null {
  const dial = dialCode.replace(/\D/g, '');
  let rest = national.replace(/[\s()\-.]/g, '');
  if (!dial || !/^\d+$/.test(rest)) return null;
  rest = rest.replace(/^0+/, '');
  return normalizePhone(`+${dial}${rest}`);
}

/** The dial code and national part of an E.164 number, given the known dial codes. */
export function splitPhone(
  e164: string | null | undefined,
  dialCodes: readonly string[],
): { dialCode: string; national: string } | null {
  const phone = normalizePhone(e164);
  if (!phone) return null;
  const digits = phone.slice(1);
  // Longest matching code wins (so +971 is not read as +9).
  const match = [...dialCodes]
    .map((d) => d.replace(/\D/g, ''))
    .sort((a, b) => b.length - a.length)
    .find((d) => digits.startsWith(d));
  return match
    ? { dialCode: `+${match}`, national: digits.slice(match.length) }
    : { dialCode: '', national: digits };
}

/** Zod: a required mobile number, normalised to E.164. */
export const phoneSchema = z
  .string({ required_error: 'Enter your mobile number.' })
  .trim()
  .min(1, 'Enter your mobile number.')
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid mobile number with its country code, e.g. +91 98765 43210.',
      });
      return z.NEVER;
    }
    return phone;
  });

/** `tel:` link for the device dialer; opens the dialer with the number filled in. */
export function telUrl(phone: string): string | null {
  const e164 = normalizePhone(phone);
  return e164 ? `tel:${e164}` : null;
}

/** Official WhatsApp click-to-chat link: digits only, no `+`, no pre-filled text, nothing sent. */
export function whatsappUrl(phone: string): string | null {
  const e164 = normalizePhone(phone);
  return e164 ? `https://wa.me/${e164.slice(1)}` : null;
}

/** The WhatsApp app's own scheme, tried first on a phone that has it installed. */
export function whatsappAppUrl(phone: string): string | null {
  const e164 = normalizePhone(phone);
  return e164 ? `whatsapp://send?phone=${e164.slice(1)}` : null;
}
