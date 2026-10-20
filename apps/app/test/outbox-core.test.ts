import { type MessageView } from '@pandam/types';
import { describe, expect, it } from 'vitest';

import {
  MAX_AUTO_ATTEMPTS,
  STALE_AFTER_MS,
  applyResult,
  backoffMs,
  classifyFailure,
  confirmedBy,
  createEntry,
  dueEntries,
  manualRetry,
  markSending,
  mergeThread,
  newClientId,
  parseOutbox,
  recoverOnLoad,
  remove,
  upsert,
  type OutboxEntry,
} from '../src/lib/chat/outbox-core';

const ME = 'usr_me';
const CONV = 'cnv_1';
const T0 = 1_000_000;

const server = (over: Partial<MessageView> = {}): MessageView => ({
  id: 'msg_1',
  conversationId: CONV,
  senderId: ME,
  isMine: true,
  body: 'hello',
  imageUrl: null,
  createdAt: T0,
  editedAt: null,
  clientId: 'c-aaaaaaaa',
  readByRecipient: false,
  ...over,
});

const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  ...createEntry(CONV, 'hi', T0, 'c-entry-0001'),
  ...over,
});

describe('client ids', () => {
  it('are within the 8-80 character range the server requires and are unique', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientId()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id.length).toBeGreaterThanOrEqual(8);
      expect(id.length).toBeLessThanOrEqual(80);
    }
  });
});

describe('classifyFailure', () => {
  it('retries what may clear up: no connection, timeouts, rate limits, server errors', () => {
    for (const status of [0, 408, 429, 500, 502, 503]) {
      expect(classifyFailure({ status }), String(status)).toBe('retry');
    }
    expect(classifyFailure(new Error('plain error'))).toBe('retry');
    expect(classifyFailure(null)).toBe('retry');
  });

  it('never retries what will not: blocked, archived, invalid, not found', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(classifyFailure({ status }), String(status)).toBe('permanent');
    }
  });
});

describe('backoff', () => {
  it('doubles from one second and is capped', () => {
    expect([0, 1, 2, 3].map(backoffMs)).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffMs(20)).toBe(60_000);
    expect(backoffMs(-5)).toBe(1000);
  });
});

describe('applyResult', () => {
  it('removes the entry once the server has stored the message', () => {
    expect(applyResult(markSending(entry()), { kind: 'sent' }, T0)).toBeNull();
  });

  it('keeps a retryable failure queued with a growing delay and the reason', () => {
    let e: OutboxEntry | null = markSending(entry());
    e = applyResult(e, { kind: 'retry', error: 'offline' }, T0)!;
    expect(e).toMatchObject({
      status: 'queued',
      attempts: 1,
      nextAttemptAt: T0 + 2000,
      lastError: 'offline',
    });
    e = applyResult(markSending(e), { kind: 'retry', error: 'offline' }, T0 + 2000)!;
    expect(e).toMatchObject({ status: 'queued', attempts: 2, nextAttemptAt: T0 + 2000 + 4000 });
  });

  it('gives up automatically after the attempt limit and asks the user', () => {
    let e: OutboxEntry | null = entry();
    for (let i = 0; i < MAX_AUTO_ATTEMPTS; i += 1) {
      e = applyResult(markSending(e!), { kind: 'retry', error: 'offline' }, T0)!;
    }
    expect(e.status).toBe('failed');
    expect(e.lastError).toMatch(/several tries/);
  });

  it('marks a permanent failure failed immediately, with the server’s reason', () => {
    const e = applyResult(
      markSending(entry()),
      { kind: 'permanent', error: 'This person is not available.' },
      T0,
    )!;
    expect(e).toMatchObject({ status: 'failed', lastError: 'This person is not available.' });
  });
});

describe('manualRetry', () => {
  it('re-queues a failed message from scratch and leaves other states alone', () => {
    const failed = entry({ status: 'failed', attempts: 8, lastError: 'x' });
    expect(manualRetry(failed, T0 + 5)).toMatchObject({
      status: 'queued',
      attempts: 0,
      nextAttemptAt: T0 + 5,
      lastError: null,
    });
    const queued = entry();
    expect(manualRetry(queued, T0 + 5)).toBe(queued);
  });
});

describe('recoverOnLoad (after an app restart)', () => {
  it('re-queues an attempt that was in flight when the app died', () => {
    const [e] = recoverOnLoad([entry({ status: 'sending' })], T0 + 10);
    expect(e).toMatchObject({ status: 'queued', nextAttemptAt: T0 + 10 });
  });

  it('does not send a day-old message behind the user’s back', () => {
    const [e] = recoverOnLoad([entry()], T0 + STALE_AFTER_MS + 1);
    expect(e).toMatchObject({ status: 'failed', lastError: 'This message was not sent in time.' });
  });

  it('leaves failed messages exactly as they were', () => {
    const failed = entry({ status: 'failed', lastError: 'blocked' });
    expect(recoverOnLoad([failed], T0 + 99)[0]).toEqual(failed);
  });
});

describe('dueEntries (ordering)', () => {
  it('releases only the OLDEST waiting message of a conversation', () => {
    const a = entry({ clientId: 'c-a-0000001', createdAt: T0 });
    const b = entry({ clientId: 'c-b-0000001', createdAt: T0 + 1 });
    expect(dueEntries([b, a], T0 + 5).map((e) => e.clientId)).toEqual(['c-a-0000001']);
  });

  it('holds later messages while an earlier one is backing off or in flight', () => {
    const a = entry({
      clientId: 'c-a-0000001',
      createdAt: T0,
      nextAttemptAt: T0 + 10_000,
      lastError: 'offline',
    });
    const b = entry({ clientId: 'c-b-0000001', createdAt: T0 + 1 });
    expect(dueEntries([a, b], T0 + 5)).toEqual([]);
    expect(dueEntries([a, b], T0 + 10_000).map((e) => e.clientId)).toEqual(['c-a-0000001']);
    const sending = { ...a, status: 'sending' as const };
    expect(dueEntries([sending, b], T0 + 99_999)).toEqual([]);
  });

  it('is not blocked by a FAILED earlier message, and treats conversations independently', () => {
    const failed = entry({ clientId: 'c-a-0000001', createdAt: T0, status: 'failed' });
    const next = entry({ clientId: 'c-b-0000001', createdAt: T0 + 1 });
    const other = entry({ clientId: 'c-c-0000001', conversationId: 'cnv_2', createdAt: T0 + 2 });
    expect(
      dueEntries([failed, next, other], T0 + 5)
        .map((e) => e.clientId)
        .sort(),
    ).toEqual(['c-b-0000001', 'c-c-0000001']);
  });
});

describe('mergeThread (what the user sees)', () => {
  it('shows each stored own message as sent, and as seen only with the recipient’s read evidence', () => {
    const items = mergeThread(
      CONV,
      [
        server({ id: 'm1', clientId: 'c-1-0000001', readByRecipient: true }),
        server({ id: 'm2', clientId: 'c-2-0000001' }),
      ],
      [],
      ME,
    );
    expect(items.map((i) => i.state)).toEqual(['seen', 'sent']);
  });

  it('never shows a "delivered" state — the vocabulary stops at sent / seen', () => {
    const states = new Set(
      mergeThread(
        CONV,
        [server()],
        [entry(), entry({ clientId: 'c-x-0000002', status: 'failed', lastError: 'no' })],
        ME,
      ).map((i) => i.state),
    );
    expect(
      [...states].every((s) => ['sending', 'waiting', 'failed', 'sent', 'seen'].includes(s)),
    ).toBe(true);
  });

  it('other people’s messages are just "sent" — no read or retry state is invented for them', () => {
    const [item] = mergeThread(
      CONV,
      [server({ isMine: false, senderId: 'usr_them', clientId: undefined })],
      [],
      ME,
    );
    expect(item!.state).toBe('sent');
    expect(item!.clientId).toBeNull();
  });

  it('appends unconfirmed messages after the server’s, labelled by what is really happening', () => {
    const items = mergeThread(
      CONV,
      [server()],
      [
        entry({ clientId: 'c-p-0000001', createdAt: T0 + 1 }), // first attempt in progress
        entry({
          clientId: 'c-w-0000001',
          createdAt: T0 + 2,
          lastError: 'Could not reach the server',
        }), // offline, will retry
        entry({
          clientId: 'c-f-0000001',
          createdAt: T0 + 3,
          status: 'failed',
          lastError: 'This person is not available.',
        }),
      ],
      ME,
    );
    expect(items.map((i) => i.state)).toEqual(['sent', 'sending', 'waiting', 'failed']);
    expect(items[2]!.error).toBe('Could not reach the server');
    expect(items[3]!.error).toBe('This person is not available.');
    expect(items.slice(1).every((i) => i.key.startsWith('local:'))).toBe(true);
  });

  it('never shows a message twice: an entry the server already stored is hidden', () => {
    // The response was lost, but the message DID arrive; the next poll returns it.
    const items = mergeThread(
      CONV,
      [server({ clientId: 'c-entry-0001' })],
      [entry({ clientId: 'c-entry-0001' })],
      ME,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.state).toBe('sent');
  });

  it('shows only this conversation’s unsent messages', () => {
    const items = mergeThread(
      CONV,
      [],
      [entry(), entry({ clientId: 'c-o-0000001', conversationId: 'cnv_other' })],
      ME,
    );
    expect(items).toHaveLength(1);
  });
});

describe('confirmedBy', () => {
  it('lists the queued entries the server has now stored', () => {
    const done = entry({ clientId: 'c-done-00001' });
    const waiting = entry({ clientId: 'c-wait-00001' });
    expect(confirmedBy([server({ clientId: 'c-done-00001' })], [done, waiting])).toEqual([done]);
  });
});

describe('upsert / remove', () => {
  it('replaces by client id and removes by client id', () => {
    const a = entry({ clientId: 'c-a-0000001' });
    const a2 = { ...a, attempts: 3 };
    expect(upsert([a], a2)).toEqual([a2]);
    expect(
      remove([a2, entry({ clientId: 'c-b-0000001' })], 'c-a-0000001').map((e) => e.clientId),
    ).toEqual(['c-b-0000001']);
  });
});

describe('parseOutbox (persisted data is never trusted)', () => {
  it('round-trips a valid queue', () => {
    const q = [entry(), entry({ clientId: 'c-two-000001', status: 'failed', lastError: 'x' })];
    expect(parseOutbox(JSON.stringify(q))).toEqual(q);
  });

  it('survives garbage, wrong shapes, and drops malformed entries', () => {
    expect(parseOutbox(null)).toEqual([]);
    expect(parseOutbox('')).toEqual([]);
    expect(parseOutbox('{not json')).toEqual([]);
    expect(parseOutbox('{"a":1}')).toEqual([]);
    const good = entry();
    const mixed = [
      good,
      { clientId: 'short', conversationId: CONV },
      42,
      null,
      { ...good, status: 'weird' },
      { ...good, clientId: 'c-ok-0000002', body: 5 },
    ];
    expect(parseOutbox(JSON.stringify(mixed))).toEqual([good]);
  });
});

describe('a whole flaky-network story', () => {
  it('queued → offline retry → arrives (response lost) → shown once, then removed', () => {
    let queue: OutboxEntry[] = [createEntry(CONV, 'are you coming?', T0, 'c-story-0001')];

    // Attempt 1 fails: no connection.
    let now = T0;
    const first = dueEntries(queue, now)[0]!;
    queue = upsert(queue, markSending(first));
    queue = upsert(
      queue,
      applyResult(markSending(first), { kind: 'retry', error: 'offline' }, now)!,
    );
    expect(mergeThread(CONV, [], queue, ME)[0]!.state).toBe('waiting');

    // Attempt 2 reaches the server, but the response is lost → still queued locally.
    now += 2000;
    const second = dueEntries(queue, now)[0]!;
    queue = upsert(
      queue,
      applyResult(markSending(second), { kind: 'retry', error: 'timeout' }, now)!,
    );

    // The next poll returns the stored message; the thread shows it once…
    const polled = [server({ id: 'msg_real', body: 'are you coming?', clientId: 'c-story-0001' })];
    const thread = mergeThread(CONV, polled, queue, ME);
    expect(thread).toHaveLength(1);
    expect(thread[0]!.state).toBe('sent');
    // …and the queue entry is recognised as confirmed and dropped.
    for (const e of confirmedBy(polled, queue)) queue = remove(queue, e.clientId);
    expect(queue).toEqual([]);
  });
});
