/**
 * Crash reporting to Sentry, without an SDK.
 *
 * Why not `@sentry/cloudflare`: this is the only thing we need from it (send
 * an unhandled error with enough context to find it), it keeps the Worker
 * bundle and dependency surface small, and — more importantly here — it lets
 * us control exactly what leaves the server. A report contains: the error
 * type, a scrubbed message and the top of the stack, the HTTP method, the
 * matched ROUTE PATTERN (never the URL, query string or ids), the request id,
 * the environment/release, and the signed-in user's opaque id. It never
 * contains request or response bodies, headers, cookies, tokens, emails or
 * the Sentry DSN itself.
 *
 * Reporting can never break a request: it runs in `waitUntil`, swallows its
 * own failures, and is skipped entirely when `SENTRY_DSN` is not configured.
 */
import { describeError, log, scrubText } from './log';

export interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

/** `https://<key>@<host>/<project>` → its parts, or null if it is not a usable DSN. */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, '').split('/').pop() ?? '';
    if (!url.username || !projectId || !/^https?:$/.test(url.protocol)) return null;
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
      protocol: url.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

export interface ErrorReport {
  error: unknown;
  requestId: string;
  method: string;
  /** The matched route pattern, e.g. `/api/v1/offers/:id/respond`. */
  route: string;
  userId?: string | null;
  environment: string;
  release?: string | undefined;
}

/** A Sentry "envelope": header, item header, event — newline-separated JSON. */
export function buildEnvelope(report: ErrorReport, dsn: string, now = new Date()): string {
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const err = describeError(report.error);
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: report.environment,
    ...(report.release ? { release: report.release } : {}),
    server_name: 'pandam-api',
    exception: { values: [{ type: err.type, value: err.message }] },
    ...(err.stack ? { extra: { stack: err.stack } } : {}),
    request: { method: report.method, url: scrubText(report.route) },
    tags: { requestId: report.requestId, route: scrubText(report.route) },
    ...(report.userId ? { user: { id: report.userId } } : {}),
  };
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn };
  return [JSON.stringify(header), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join(
    '\n',
  );
}

export interface ReportDeps {
  dsn: string | undefined;
  /** Registers background work (`ctx.waitUntil`); absent in unit tests. */
  waitUntil?: ((p: Promise<unknown>) => void) | undefined;
  fetchImpl?: typeof fetch | undefined;
}

/**
 * Send an unhandled error to Sentry. Returns immediately; never throws.
 * A no-op when no DSN is configured.
 */
export function reportError(report: ErrorReport, deps: ReportDeps): void {
  const parsed = parseDsn(deps.dsn);
  if (!parsed || !deps.dsn) return;
  const send = async () => {
    try {
      const url = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/?sentry_version=7&sentry_key=${parsed.publicKey}`;
      const res = await (deps.fetchImpl ?? fetch)(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: buildEnvelope(report, deps.dsn!),
      });
      if (!res.ok) log('warn', 'crash report rejected', { status: res.status });
    } catch (error) {
      // Reporting must never take the API down with it.
      log('warn', 'crash report failed', { reason: describeError(error).message });
    }
  };
  const work = send();
  try {
    deps.waitUntil?.(work);
  } catch {
    // No execution context: the promise still runs and handles its own errors.
  }
}
