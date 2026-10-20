/**
 * Structured logging: one JSON object per line, which Cloudflare's log
 * pipeline (and any log search) can filter by field. Anything that looks
 * secret is redacted before it is written — callers pass facts about a
 * request (ids, status, timing), never bodies, but redaction is the safety
 * net for a mistake.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Keys whose VALUE is never logged. */
const SENSITIVE_KEY =
  /authorization|cookie|password|passwd|secret|token|dsn|api[-_]?key|id[-_]?token|bearer|credential|signature/i;
/**
 * Values that look like credentials even under an innocent key: a `Bearer …`
 * header value, or a long unbroken token. Session tokens are 43 characters;
 * the 36-character ids PANDAM uses (`usr_…`, request-id UUIDs) are deliberately
 * left readable so logs can be correlated.
 */
const SENSITIVE_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b[A-Za-z0-9_-]{40,}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const MAX_STRING = 500;
const MAX_DEPTH = 5;

/** Remove credentials and personal addresses from free text (error messages, URLs). */
export function scrubText(text: string): string {
  return text.replace(SENSITIVE_VALUE, '[redacted]').replace(EMAIL, '[email]').slice(0, MAX_STRING);
}

/** Deep-copy `value` with sensitive keys and secret-looking strings redacted. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubText(value);
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  });
  /* eslint-disable no-console -- this module IS the logging sink */
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  /* eslint-enable no-console */
}

/** A loggable description of an error — type, scrubbed message, and the top of the stack. */
export function describeError(error: unknown): { type: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      message: scrubText(error.message),
      ...(error.stack
        ? { stack: scrubText(error.stack.split('\n').slice(0, 8).join('\n')).slice(0, 2000) }
        : {}),
    };
  }
  return { type: typeof error, message: scrubText(String(error)) };
}
