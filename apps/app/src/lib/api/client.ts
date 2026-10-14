/**
 * The single HTTP entrypoint for the PANDAM API. Screens and hooks call
 * `apiFetch` / the resource modules — never `fetch` directly — so base URL,
 * credentials, auth header and error handling live in one place.
 *
 *  - `credentials: 'include'` so the web session cookie is sent.
 *  - On native, the Bearer token from secure storage is attached.
 *  - Non-2xx / `{ ok:false }` responses become a typed `ApiError`.
 */
import { clientEnv } from '@/lib/env';
import { sessionToken } from '@/lib/session/storage';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(message: string, code: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, string[]> } };

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionToken.get();
  const headers = new Headers(init.headers);
  // FormData must set its own Content-Type: the multipart boundary is part of
  // the header value, so overriding it makes the body unparseable server-side.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${clientEnv.apiUrl}${path}`, { ...init, headers, credentials: 'include' });
  } catch (err) {
    // The generic ApiError below is all the UI ever shows — this is the only
    // place the raw fetch failure (name/message, e.g. a native "Network
    // request failed" vs. an abort vs. something else) is ever visible, so
    // log it rather than silently discarding it.
    console.error('[apiFetch] fetch failed for', path, err);
    // In development, name the address that was tried: "could not reach" alone
    // cannot tell a wrong host from a blocked port.
    const where = __DEV__ ? ` (${clientEnv.apiUrl})` : '';
    throw new ApiError(`Could not reach the PANDAM API${where}.`, 'network_error', 0);
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.ok === false) {
    const err = body && body.ok === false ? body.error : undefined;
    throw new ApiError(
      err?.message ?? `Request failed (${res.status}).`,
      err?.code ?? 'request_failed',
      res.status,
      err?.details,
    );
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  delete: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, {
      method: 'DELETE',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  /** Multipart upload (images). The caller builds the `FormData`. */
  upload: <T>(path: string, form: FormData) => apiFetch<T>(path, { method: 'POST', body: form }),
  post: <T>(path: string, data?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  patch: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
};
