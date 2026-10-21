/**
 * The chat outbox — pure logic, no React Native imports, fully unit-tested.
 *
 * A message the user sends is first written to a persistent queue, then sent.
 * The queue is what makes sending reliable on a bad connection:
 *
 *  - Nothing is ever lost: the entry survives an app restart and is sent again.
 *  - Nothing is ever doubled: every entry carries a `clientId` the server
 *    de-duplicates on, so re-sending a message that actually DID arrive is
 *    harmless.
 *  - Order is kept: within one conversation only the oldest waiting message is
 *    sent, so a slow first message cannot be overtaken by the second.
 *  - Nothing pretends: the thread shows `sending`, `waiting` (offline, will
 *    retry), `failed` (needs the user) and, once the server has it, `sent` —
 *    and `seen` only when the recipient's read marker proves it. There is no
 *    "delivered" state because nothing acknowledges delivery to a device.
 */
import { type MessageView } from '@pandam/types';

/** After this many failed automatic attempts, stop and ask the user. */
export const MAX_AUTO_ATTEMPTS = 8;
/** A message still unsent after this long is not sent behind the user's back. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 60_000;

export type OutboxStatus = 'queued' | 'sending' | 'failed';

export interface OutboxEntry {
  clientId: string;
  conversationId: string;
  body: string;
  /** Local time the user pressed send; orders unsent messages. */
  createdAt: number;
  status: OutboxStatus;
  attempts: number;
  /** Earliest time the next automatic attempt may run. */
  nextAttemptAt: number;
  /** Why the last attempt failed (shown to the user), or null. */
  lastError: string | null;
}

export type SendResult =
  { kind: 'sent' } | { kind: 'retry'; error: string } | { kind: 'permanent'; error: string };

export type DisplayState = 'sending' | 'waiting' | 'failed' | 'sent' | 'seen';

export interface ThreadItem {
  key: string;
  message: MessageView;
  state: DisplayState;
  /** Set for `waiting` / `failed`. */
  error: string | null;
  /** The outbox id when this item is still local. */
  clientId: string | null;
}

/** A fresh retry id (8-80 chars, as the server requires). */
export function newClientId(random: () => number = Math.random, now: () => number = Date.now) {
  return `c-${now().toString(36)}-${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, '0')}`;
}

export function createEntry(
  conversationId: string,
  body: string,
  now: number,
  clientId: string = newClientId(),
): OutboxEntry {
  return {
    clientId,
    conversationId,
    body,
    createdAt: now,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  };
}

/**
 * Is this failure worth retrying by itself? A dropped connection (status 0),
 * a server error, a timeout or a rate limit may clear up; a 4xx such as
 * "blocked", "archived" or "validation failed" never will.
 */
export function classifyFailure(error: unknown): 'retry' | 'permanent' {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as { status: unknown }).status)
      : 0;
  if (!Number.isFinite(status) || status === 0) return 'retry';
  if (status >= 500 || status === 408 || status === 429) return 'retry';
  return 'permanent';
}

export function messageOf(error: unknown, fallback = 'Could not send.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 1s, 2s, 4s … capped at 60s. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempts));
}

export function markSending(entry: OutboxEntry): OutboxEntry {
  return { ...entry, status: 'sending' };
}

/**
 * Fold the outcome of one attempt into the entry. Returns `null` when the
 * message has been stored by the server (the entry is finished and removed).
 */
export function applyResult(
  entry: OutboxEntry,
  result: SendResult,
  now: number,
): OutboxEntry | null {
  if (result.kind === 'sent') return null;
  if (result.kind === 'permanent') {
    return { ...entry, status: 'failed', lastError: result.error, nextAttemptAt: now };
  }
  const attempts = entry.attempts + 1;
  if (attempts >= MAX_AUTO_ATTEMPTS) {
    return {
      ...entry,
      status: 'failed',
      attempts,
      nextAttemptAt: now,
      lastError: 'This message could not be sent after several tries.',
    };
  }
  return {
    ...entry,
    status: 'queued',
    attempts,
    nextAttemptAt: now + backoffMs(attempts),
    lastError: result.error,
  };
}

/** The user taps "retry" on a failed message. */
export function manualRetry(entry: OutboxEntry, now: number): OutboxEntry {
  if (entry.status !== 'failed') return entry;
  return { ...entry, status: 'queued', attempts: 0, nextAttemptAt: now, lastError: null };
}

/**
 * Entries restored from storage after a restart. An attempt that was in flight
 * when the app died is simply queued again (safe: the server de-duplicates),
 * and a message left unsent for a day is marked failed rather than being sent
 * long after the conversation moved on.
 */
export function recoverOnLoad(entries: OutboxEntry[], now: number): OutboxEntry[] {
  return entries.map((e) => {
    if (e.status === 'failed') return e;
    if (now - e.createdAt > STALE_AFTER_MS) {
      return { ...e, status: 'failed', lastError: 'This message was not sent in time.' };
    }
    return e.status === 'sending' ? { ...e, status: 'queued', nextAttemptAt: now } : e;
  });
}

/**
 * Entries that may be sent right now: per conversation, only the OLDEST
 * message still waiting, and only when its backoff has elapsed and nothing in
 * that conversation is already in flight. (A failed message does not block
 * those behind it — the user can see it and decide.)
 */
export function dueEntries(entries: OutboxEntry[], now: number): OutboxEntry[] {
  const byConversation = new Map<string, OutboxEntry[]>();
  for (const e of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
    if (e.status === 'failed') continue;
    const list = byConversation.get(e.conversationId) ?? [];
    list.push(e);
    byConversation.set(e.conversationId, list);
  }
  const due: OutboxEntry[] = [];
  for (const list of byConversation.values()) {
    if (list.some((e) => e.status === 'sending')) continue;
    const oldest = list[0];
    if (oldest && oldest.status === 'queued' && oldest.nextAttemptAt <= now) due.push(oldest);
  }
  return due;
}

export const upsert = (entries: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] => [
  ...entries.filter((e) => e.clientId !== entry.clientId),
  entry,
];

export const remove = (entries: OutboxEntry[], clientId: string): OutboxEntry[] =>
  entries.filter((e) => e.clientId !== clientId);

/** Read the persisted queue defensively: anything malformed is dropped, never trusted. */
export function parseOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: OutboxEntry[] = [];
  for (const e of parsed) {
    if (
      e &&
      typeof e === 'object' &&
      typeof e.clientId === 'string' &&
      e.clientId.length >= 8 &&
      typeof e.conversationId === 'string' &&
      typeof e.body === 'string' &&
      typeof e.createdAt === 'number' &&
      ['queued', 'sending', 'failed'].includes(e.status) &&
      typeof e.attempts === 'number' &&
      typeof e.nextAttemptAt === 'number'
    ) {
      out.push({
        clientId: e.clientId,
        conversationId: e.conversationId,
        body: e.body,
        createdAt: e.createdAt,
        status: e.status,
        attempts: e.attempts,
        nextAttemptAt: e.nextAttemptAt,
        lastError: typeof e.lastError === 'string' ? e.lastError : null,
      });
    }
  }
  return out;
}

/**
 * What the thread shows: the server's messages, then any of this conversation's
 * messages the server has not confirmed yet. An outbox entry whose `clientId`
 * the server already returned is NOT shown again — that is how a message that
 * arrived while the response was lost never appears twice.
 */
export function mergeThread(
  conversationId: string,
  server: MessageView[],
  entries: OutboxEntry[],
  meId: string,
): ThreadItem[] {
  const stored = new Set(
    server.filter((m) => m.isMine && m.clientId).map((m) => m.clientId as string),
  );
  const items: ThreadItem[] = server.map((m) => ({
    key: m.id,
    message: m,
    state: m.isMine ? (m.readByRecipient ? 'seen' : 'sent') : 'sent',
    error: null,
    clientId: null,
  }));
  const local = entries
    .filter((e) => e.conversationId === conversationId && !stored.has(e.clientId))
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const e of local) {
    const state: DisplayState =
      e.status === 'failed'
        ? 'failed'
        : e.lastError && e.status === 'queued'
          ? 'waiting'
          : 'sending';
    items.push({
      key: `local:${e.clientId}`,
      message: {
        id: `local:${e.clientId}`,
        conversationId,
        senderId: meId,
        isMine: true,
        body: e.body,
        imageUrl: null,
        videoUrl: null,
        location: null,
        createdAt: e.createdAt,
        editedAt: null,
        clientId: e.clientId,
        readByRecipient: false,
      },
      state,
      error: state === 'sending' ? null : e.lastError,
      clientId: e.clientId,
    });
  }
  return items;
}

/** Entries the server has already stored — safe to drop from the queue. */
export function confirmedBy(server: MessageView[], entries: OutboxEntry[]): OutboxEntry[] {
  const stored = new Set(
    server.filter((m) => m.isMine && m.clientId).map((m) => m.clientId as string),
  );
  return entries.filter((e) => stored.has(e.clientId));
}
