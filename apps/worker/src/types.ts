/**
 * The Hono generic for every PANDAM router: request bindings + the variables
 * that middleware attaches to the context.
 */
import { type RequestContext } from './context';
import { type Env } from './env';
import { type AuthenticatedContext } from './services/auth';

export interface AppVariables {
  /** Set by `observability` for every request; also returned as `X-Request-Id`. */
  requestId: string;
  /** Set by `contextMiddleware` for every `/api/v1` route. */
  ctx: RequestContext;
  /** Set by `authMiddleware`: the authenticated user + session, or `null`. */
  auth: AuthenticatedContext | null;
}

export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}
