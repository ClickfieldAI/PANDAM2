/**
 * Consistent HTTP result helpers for the PANDAM API.
 *
 * Every response body is one of the `@pandam/types` envelopes:
 *   success -> { ok: true, data }
 *   failure -> { ok: false, error: { code, message, details? } }
 *
 * Handlers never throw raw errors to the client and never leak internals: the
 * global `onError` maps anything unexpected to a generic `internal_error`.
 */
import { type ApiErr, type ApiOk } from '@pandam/types';
import { type ZodError } from '@pandam/validation';
import { type Context } from 'hono';
import { type ContentfulStatusCode } from 'hono/utils/http-status';

export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'too_many_requests'
  | 'payload_too_large'
  | 'not_implemented'
  | 'db_unavailable'
  | 'internal_error';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  too_many_requests: 429,
  payload_too_large: 413,
  not_implemented: 501,
  db_unavailable: 503,
  internal_error: 500,
};

/** A domain/HTTP error that route code may throw; caught by the app `onError`. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code];
  }
}

export const ok = <T>(data: T): ApiOk<T> => ({ ok: true, data });

export const errBody = (
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>,
  requestId?: string,
): ApiErr => ({
  ok: false,
  error: {
    code,
    message,
    ...(details ? { details } : {}),
    // Quote this to support: it identifies the exact log line and crash report.
    ...(requestId ? { requestId } : {}),
  },
});

/** Write a success envelope. */
export function sendOk<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json(ok(data), status);
}

/** Write an error envelope with the status mapped from `code`. */
export function sendError(
  c: Context,
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>,
) {
  const requestId = (c as Context<{ Variables: { requestId?: string } }>).get('requestId');
  return c.json(errBody(code, message, details, requestId), STATUS[code]);
}

/** Flatten a ZodError into `{ field: [messages] }`. */
export function zodDetails(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Standard "this route group has no handler yet" response. */
export function notImplemented(c: Context, what: string) {
  return sendError(c, 'not_implemented', `${what} is not implemented in this phase`);
}
