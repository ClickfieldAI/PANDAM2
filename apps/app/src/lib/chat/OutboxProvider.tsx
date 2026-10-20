/**
 * Owns the persistent chat outbox for the signed-in user (see `outbox-core.ts`
 * for the rules). It lives above the screens so an unsent message keeps being
 * retried even after the user leaves that chat, and it is keyed by user id so
 * one account's unsent messages are never sent as another's.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { type MessageView } from '@pandam/types';

import { conversationsApi } from '@/lib/api/conversations';
import { qk } from '@/lib/query/keys';

import {
  type OutboxEntry,
  type SendResult,
  applyResult,
  classifyFailure,
  confirmedBy,
  createEntry,
  dueEntries,
  manualRetry,
  markSending,
  messageOf,
  parseOutbox,
  recoverOnLoad,
  remove,
  upsert,
} from './outbox-core';

const keyFor = (userId: string) => `pandam.chat.outbox.v1.${userId}`;
/** How often the queue is checked for a message whose retry time has come. */
const PUMP_MS = 2_000;

interface OutboxApi {
  entries: OutboxEntry[];
  /** Queue a text message. Returns immediately; sending happens in the background. */
  enqueue: (conversationId: string, body: string) => void;
  /** The user tapped "retry" on a failed message. */
  retry: (clientId: string) => void;
  /** The user chose to drop an unsent message. */
  discard: (clientId: string) => void;
  /** Drop queue entries the server has already stored (called with a fresh message list). */
  reconcile: (serverMessages: MessageView[]) => void;
}

const OutboxContext = createContext<OutboxApi>({
  entries: [],
  enqueue: () => undefined,
  retry: () => undefined,
  discard: () => undefined,
  reconcile: () => undefined,
});

export const useChatOutbox = () => useContext(OutboxContext);

export function ChatOutboxProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const client = useQueryClient();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const entriesRef = useRef<OutboxEntry[]>([]);
  const loaded = useRef(false);
  const inFlight = useRef(new Set<string>());

  const commit = useCallback(
    (next: OutboxEntry[]) => {
      entriesRef.current = next;
      setEntries(next);
      // Persist every change; a failed write only costs resilience, never correctness.
      AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch(() => undefined);
    },
    [userId],
  );

  const attempt = useCallback(
    async (entry: OutboxEntry) => {
      if (inFlight.current.has(entry.clientId)) return;
      inFlight.current.add(entry.clientId);
      commit(upsert(entriesRef.current, markSending(entry)));

      let result: SendResult;
      try {
        await conversationsApi.sendMessage(entry.conversationId, {
          body: entry.body,
          clientId: entry.clientId,
        });
        result = { kind: 'sent' };
      } catch (error) {
        const kind = classifyFailure(error);
        result = { kind, error: messageOf(error) } as SendResult;
      } finally {
        inFlight.current.delete(entry.clientId);
      }

      // The user may have discarded it while it was in flight.
      const current = entriesRef.current.find((e) => e.clientId === entry.clientId);
      if (!current) return;

      if (result.kind === 'sent') {
        // Fetch the stored message BEFORE dropping the queue entry, so the bubble
        // never flickers away between "sending" and "sent".
        await client
          .refetchQueries({ queryKey: qk.conversations.messages(entry.conversationId) })
          .catch(() => undefined);
        void client.invalidateQueries({ queryKey: qk.conversations.all });
        commit(remove(entriesRef.current, entry.clientId));
        return;
      }
      commit(upsert(entriesRef.current, applyResult(current, result, Date.now())!));
    },
    [client, commit],
  );

  const pump = useCallback(() => {
    if (!loaded.current) return;
    for (const entry of dueEntries(entriesRef.current, Date.now())) void attempt(entry);
  }, [attempt]);

  // Restore the queue after a restart, then start sending whatever is due.
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(keyFor(userId))
      .then((raw) => {
        if (cancelled) return;
        loaded.current = true;
        commit(recoverOnLoad(parseOutbox(raw), Date.now()));
        pump();
      })
      .catch(() => {
        loaded.current = true;
      });
    return () => {
      cancelled = true;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Retry on a timer and whenever the app returns to the foreground.
  useEffect(() => {
    const timer = setInterval(pump, PUMP_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') pump();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [pump]);

  const api = useMemo<OutboxApi>(
    () => ({
      entries,
      enqueue: (conversationId, body) => {
        commit(upsert(entriesRef.current, createEntry(conversationId, body, Date.now())));
        pump();
      },
      retry: (clientId) => {
        const e = entriesRef.current.find((x) => x.clientId === clientId);
        if (!e) return;
        commit(upsert(entriesRef.current, manualRetry(e, Date.now())));
        pump();
      },
      discard: (clientId) => commit(remove(entriesRef.current, clientId)),
      reconcile: (serverMessages) => {
        const done = confirmedBy(serverMessages, entriesRef.current);
        if (done.length === 0) return;
        let next = entriesRef.current;
        for (const e of done) next = remove(next, e.clientId);
        commit(next);
      },
    }),
    [entries, commit, pump],
  );

  return <OutboxContext.Provider value={api}>{children}</OutboxContext.Provider>;
}
