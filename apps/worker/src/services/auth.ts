/**
 * Authentication service — the one place that knows how registration, login,
 * session validation and logout actually work. It orchestrates the repository
 * layer and the crypto helpers; it does not know about HTTP.
 *
 * Security properties enforced here:
 *  - passwords are only ever stored as PBKDF2 hashes (see lib/crypto)
 *  - login returns a single generic error and runs a constant-cost dummy verify
 *    for unknown accounts, so it cannot be used to enumerate emails
 *  - session tokens are random 256-bit values; only their SHA-256 hash is stored
 *  - a suspended/deleted user cannot authenticate even with a live session
 */
import {
  type OAuthProvider,
  type Repositories,
  type SessionRow,
  type UserRow,
} from '@pandam/database';
import { type LoginInput, type RegisterInput } from '@pandam/validation';

import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsRehash,
  verifyPassword,
} from '../lib/crypto';
import { ApiError } from '../lib/http';
import { type VerifiedOAuthIdentity } from '../lib/oauth';

/** 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Generic login failure — never says which part was wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

/**
 * A well-formed hash the dummy verify runs against for unknown accounts, so a
 * missing user costs the same CPU as a wrong password. Value is irrelevant.
 */
const DUMMY_HASH = `pbkdf2$sha256$210000$${'A'.repeat(22)}$${'A'.repeat(43)}`;

export interface RequestMeta {
  userAgent?: string | null;
}

export interface AuthResult {
  user: UserRow;
  session: SessionRow;
  /** Raw token — returned to the caller once, never stored. */
  token: string;
}

export interface AuthenticatedContext {
  user: UserRow;
  session: SessionRow;
}

/**
 * `users.email` is required and unique — creating an account needs one.
 * Google always includes it; Apple includes it on every first authorization
 * and normally on every one after, but a user can decline to share it or
 * later revoke access in their Apple ID settings. That is rare enough (and
 * the sign-in button always retries a normal Apple flow next time) that a
 * clear failure here is the right behaviour rather than inventing a
 * placeholder address nobody can receive mail at.
 */
function requireEmail(verified: VerifiedOAuthIdentity): string {
  if (!verified.email) {
    throw new ApiError(
      'bad_request',
      'PANDAM needs an email address to create your account. Please allow email sharing and try again.',
    );
  }
  return verified.email;
}

export function createAuthService(repos: Repositories) {
  async function issueSession(
    userId: string,
    meta: RequestMeta,
  ): Promise<SessionRow & { token: string }> {
    const token = generateSessionToken();
    const tokenHash = await hashSessionToken(token);
    const session = await repos.sessions.create({
      userId,
      tokenHash,
      expiresAt: Date.now() + SESSION_TTL_MS,
      userAgent: meta.userAgent ?? null,
    });
    return Object.assign(session, { token });
  }

  return {
    async register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
      const email = input.email.trim().toLowerCase();

      if (await repos.users.findByEmail(email)) {
        throw new ApiError('conflict', 'An account with that email already exists.', {
          email: ['already registered'],
        });
      }
      if (input.username && (await repos.profiles.findByUsername(input.username))) {
        throw new ApiError('conflict', 'That username is taken.', {
          username: ['already taken'],
        });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await repos.users.create({ email });
      await repos.credentials.create(user.id, passwordHash);
      await repos.profiles.create({
        userId: user.id,
        displayName: input.displayName,
        username: input.username ?? null,
      });

      const session = await issueSession(user.id, meta);
      return { user, session, token: session.token };
    },

    async login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
      const email = input.email.trim().toLowerCase();
      const user = await repos.users.findByEmail(email);
      const credential = user ? await repos.credentials.findByUserId(user.id) : null;

      // Always run a verify so timing does not distinguish "no such user".
      const passwordOk = await verifyPassword(
        input.password,
        credential?.passwordHash ?? DUMMY_HASH,
      );

      if (!user || !credential || !passwordOk) {
        throw new ApiError('unauthorized', INVALID_CREDENTIALS);
      }
      if (user.status !== 'active') {
        throw new ApiError(
          'forbidden',
          user.status === 'suspended'
            ? 'This account has been suspended.'
            : 'This account is not active.',
        );
      }

      if (needsRehash(credential.passwordHash)) {
        try {
          await repos.credentials.updateHash(user.id, await hashPassword(input.password));
        } catch {
          // Non-fatal: the login still succeeds with the old (valid) hash.
        }
      }

      const session = await issueSession(user.id, meta);
      return { user, session, token: session.token };
    },

    /**
     * "Sign in with Google/Apple" — `verified` has already been checked
     * against the provider's own signature (see `lib/oauth.ts`); this only
     * makes the identity/account decision:
     *
     *  1. This exact provider subject has signed in before → that account.
     *  2. First time, but the provider vouches for an email that already has
     *     an account here → link this identity to it (so a user who first
     *     registered with a password, then taps "Continue with Google" using
     *     the same address, lands on the one account instead of a duplicate).
     *  3. Otherwise → a brand-new account, named from `displayNameHint` (the
     *     name the provider handed back on this first authorization) or a
     *     generic fallback the user can change on Profile.
     *
     * A suspended/deleted user is rejected the same way password login
     * rejects one — an OAuth identity is not a bypass.
     */
    async loginWithOAuth(
      provider: OAuthProvider,
      verified: VerifiedOAuthIdentity,
      meta: RequestMeta,
      displayNameHint?: string,
    ): Promise<AuthResult> {
      const existingIdentity = await repos.oauthIdentities.findByProviderSubject(
        provider,
        verified.subject,
      );

      let user: UserRow | null = null;

      if (existingIdentity) {
        user = await repos.users.findById(existingIdentity.userId);
        if (!user) {
          throw new ApiError('internal_error', 'Could not resolve this account.');
        }
      } else {
        const email = requireEmail(verified);
        const linkableUser = verified.emailVerified ? await repos.users.findByEmail(email) : null;

        // The provider gave an email that already has an account here, but it
        // did not vouch for it enough to trust an automatic link (or a
        // different provider already claimed that email unverified). Either
        // way, silently creating a second account with the same address would
        // hit the email uniqueness constraint — and even if it didn't, it
        // would be the wrong outcome. Ask the user to sign in with whatever
        // method that account already uses instead.
        if (!linkableUser && (await repos.users.findByEmail(email))) {
          throw new ApiError(
            'conflict',
            'An account with that email already exists. Sign in with your password, or use the original sign-in method for that account.',
          );
        }

        user = linkableUser ?? (await repos.users.create({ email }));

        await repos.oauthIdentities.create({
          userId: user.id,
          provider,
          providerUserId: verified.subject,
          email: verified.email,
        });

        // A brand-new account needs the profile row every other screen
        // assumes exists. A linked existing account already has one.
        if (!linkableUser) {
          await repos.profiles.create({
            userId: user.id,
            displayName: displayNameHint?.trim() || 'PANDAM member',
            username: null,
          });
        }
      }

      if (user.status !== 'active') {
        throw new ApiError(
          'forbidden',
          user.status === 'suspended'
            ? 'This account has been suspended.'
            : 'This account is not active.',
        );
      }

      const session = await issueSession(user.id, meta);
      return { user, session, token: session.token };
    },

    /** Resolve a raw bearer/cookie token to a live session + active user. */
    async authenticate(rawToken: string): Promise<AuthenticatedContext | null> {
      if (!rawToken) return null;
      const tokenHash = await hashSessionToken(rawToken);
      const session = await repos.sessions.findLiveByTokenHash(tokenHash);
      if (!session) return null;

      const user = await repos.users.findById(session.userId);
      if (!user || user.status !== 'active') return null;

      try {
        await repos.sessions.touchLastUsed(session.id);
      } catch {
        // best-effort
      }
      return { user, session };
    },

    async logout(sessionId: string): Promise<void> {
      await repos.sessions.revoke(sessionId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
