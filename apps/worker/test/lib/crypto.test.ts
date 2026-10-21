import { describe, expect, it } from 'vitest';

import {
  PBKDF2_ROUND_ITERATIONS,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsRehash,
  verifyPassword,
} from '../../src/lib/crypto';

/**
 * A real `pbkdf2$sha256$...` (legacy, pre-chained-fix) hash, generated once
 * with the exact same PBKDF2-HMAC-SHA-256 primitive the old single-round
 * code used — frozen here so a format change can never silently break
 * verification of accounts created before this fix.
 */
const LEGACY_PASSWORD = 'legacy-fixture-password-1';
const LEGACY_HASH =
  'pbkdf2$sha256$1000$AQIDBAUGBwgJCgsMDQ4PEA$pNNP2Om2AbcRntmwt4RA9be0YMJqKupjnYbfVDEe980';

describe('password hashing', () => {
  it('produces a self-describing pbkdf2x2 string, within the Workers-enforced per-call cap, and never the plaintext', async () => {
    // The Workers runtime (workerd) rejects a single PBKDF2 call above
    // 100,000 iterations (confirmed against the real deployed staging
    // Worker, and in workerd's own source — see crypto.ts's file header).
    // This is the regression guard for that: any future bump of
    // PBKDF2_ROUND_ITERATIONS must stay under that ceiling.
    expect(PBKDF2_ROUND_ITERATIONS).toBeLessThanOrEqual(100_000);

    const hash = await hashPassword('correct horse 9');
    expect(hash.startsWith(`pbkdf2x2$sha256$${PBKDF2_ROUND_ITERATIONS}$`)).toBe(true);
    expect(hash).not.toContain('correct horse 9');
    // prefix$iterations$salt1$salt2$hash
    expect(hash.split('$')).toHaveLength(6);
  });

  it('verifies the right password and rejects the wrong one (new format)', async () => {
    const hash = await hashPassword('s3cret pass');
    expect(await verifyPassword('s3cret pass', hash)).toBe(true);
    expect(await verifyPassword('s3cret Pass', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('uses random salts (two hashes of the same password differ)', async () => {
    const [a, b] = await Promise.all([hashPassword('same input 1'), hashPassword('same input 1')]);
    expect(a).not.toBe(b);
  });

  it('rejects a malformed stored hash without throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2x2$sha256$abc$def')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$sha256$abc$def')).toBe(false);
  });

  it('still verifies an existing (legacy, pre-fix) hash correctly', async () => {
    expect(await verifyPassword(LEGACY_PASSWORD, LEGACY_HASH)).toBe(true);
    expect(await verifyPassword('wrong password', LEGACY_HASH)).toBe(false);
  });

  it('rejects (never clamps) an iteration count above the Workers-enforced cap', async () => {
    // A stored hash claiming 210,000 iterations (the old, pre-fix work
    // factor) could never have been produced by crypto.subtle on the real
    // Workers runtime — refuse it outright rather than attempting it and
    // either clamping silently or throwing.
    const tooHighX2 = 'pbkdf2x2$sha256$210000$AQIDBAUGBwgJCgsMDQ4PEA$AQIDBAUGBwgJCgsMDQ4PEA$abcd';
    const tooHighLegacy = 'pbkdf2$sha256$210000$AQIDBAUGBwgJCgsMDQ4PEA$abcd';
    expect(await verifyPassword('anything', tooHighX2)).toBe(false);
    expect(await verifyPassword('anything', tooHighLegacy)).toBe(false);
    // Exactly at the cap is still fine (just won't match this bogus hash).
    const atCap = 'pbkdf2$sha256$100000$AQIDBAUGBwgJCgsMDQ4PEA$abcd';
    expect(await verifyPassword('anything', atCap)).toBe(false);
  });

  it('returns false — never throws — for malformed Base64URL fields', async () => {
    const badCharsX2 = 'pbkdf2x2$sha256$1000$not-valid-base64!!!$also-bad!!!$and-this-too!!!';
    const badCharsLegacy = 'pbkdf2$sha256$1000$not-valid-base64!!!$also-bad!!!';
    await expect(verifyPassword('anything', badCharsX2)).resolves.toBe(false);
    await expect(verifyPassword('anything', badCharsLegacy)).resolves.toBe(false);
  });

  it('needsRehash: false for a current hash, true for legacy, weaker, or invalid', async () => {
    expect(needsRehash(await hashPassword('abc12345678'))).toBe(false);
    expect(needsRehash(LEGACY_HASH)).toBe(true);
    expect(needsRehash('pbkdf2x2$sha256$1000$aaaa$bbbb$cccc')).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });
});

describe('session tokens', () => {
  it('generates unguessable, url-safe tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hashes tokens to stable 64-hex and different tokens do not collide', async () => {
    const t = generateSessionToken();
    const h1 = await hashSessionToken(t);
    const h2 = await hashSessionToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSessionToken(generateSessionToken())).not.toBe(h1);
  });
});
