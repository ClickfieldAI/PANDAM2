import { type UserRole } from '@pandam/database/enums';
import { createMiddleware } from 'hono/factory';

import { ApiError } from '../lib/http';
import { type AppEnv } from '../types';

import { getAuth } from './auth';

/**
 * Allow only the listed staff roles. Runs after `authMiddleware` + `requireAuth`.
 * The role comes from the user row that `authenticate` loaded for THIS request
 * (never from the token or the client), so a demotion or suspension is
 * effective on the very next call. A regular user gets 403 without learning
 * anything about what the admin surface contains.
 */
export const requireRole = (...allowed: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const { user } = getAuth(c);
    if (!allowed.includes(user.role)) {
      throw new ApiError('forbidden', 'You do not have access to this.');
    }
    await next();
  });
