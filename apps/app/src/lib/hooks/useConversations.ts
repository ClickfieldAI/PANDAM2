/** TanStack Query hooks for conversations & messages. */
import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { conversationsApi } from '@/lib/api/conversations';
import { qk } from '@/lib/query/keys';

export function useConversations() {
  return useQuery({
    queryKey: qk.conversations.all,
    queryFn: async () => (await conversationsApi.list()).items,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: qk.conversations.detail(id ?? ''),
    queryFn: async () => (await conversationsApi.get(id!)).conversation,
    enabled: !!id,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: qk.conversations.messages(conversationId ?? ''),
    queryFn: async () => (await conversationsApi.messages(conversationId!)).items,
    enabled: !!conversationId,
    refetchInterval: 4_000,
  });
}

export function useSendMessage(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { body?: string; imageKey?: string; clientId?: string }) =>
      conversationsApi.sendMessage(conversationId, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.conversations.messages(conversationId) });
      void client.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });
}

export function useMarkConversationRead(conversationId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => conversationsApi.markRead(conversationId),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.conversations.all }),
  });
}

/** How often to poll whether the other side is typing. */
const TYPING_POLL_MS = 2_000;
/** How long of a pause in `notifyTyping()` calls before we signal "stopped". */
const TYPING_STOP_DEBOUNCE_MS = 1_500;
/** Minimum gap between two "still typing" refreshes sent to the server. */
const TYPING_REFRESH_MS = 2_000;

/**
 * The "is the other person typing" indicator: a short-poll read of the
 * server's typing state, plus a debounced writer the composer calls on every
 * keystroke.
 *
 * The writer never fires on every keystroke — it throttles the "typing"
 * refresh to once per `TYPING_REFRESH_MS` and resets a `TYPING_STOP_DEBOUNCE_MS`
 * timer on each call, so a brief pause (not every pause) is what sends
 * "stopped". The server independently expires a stale signal (see
 * `TYPING_TTL_MS` in the Worker route), so a dropped "stop" — a closed tab, a
 * lost request — can never wedge the indicator on for the other side.
 */
export function useTypingIndicator(conversationId: string | undefined) {
  const typingQuery = useQuery({
    queryKey: qk.conversations.typing(conversationId ?? ''),
    queryFn: async () => (await conversationsApi.typing(conversationId!)).typing,
    enabled: !!conversationId,
    refetchInterval: TYPING_POLL_MS,
    staleTime: 0,
  });

  // Refs, not state — this bookkeeping should never itself trigger a render.
  const lastSentAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    // Only bother telling the server if we ever told it we started.
    if (conversationId && lastSentAtRef.current !== 0) {
      lastSentAtRef.current = 0;
      void conversationsApi.setTyping(conversationId, false).catch(() => undefined);
    }
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastSentAtRef.current >= TYPING_REFRESH_MS) {
      lastSentAtRef.current = now;
      void conversationsApi.setTyping(conversationId, true).catch(() => undefined);
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(stopTyping, TYPING_STOP_DEBOUNCE_MS);
  }, [conversationId, stopTyping]);

  useEffect(() => {
    // Leaving the screen or switching conversations: drop any pending
    // debounce timer and tell the server we stopped, same as `stopTyping()`.
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (conversationId && lastSentAtRef.current !== 0) {
        void conversationsApi.setTyping(conversationId, false).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return { otherTyping: typingQuery.data ?? false, notifyTyping, stopTyping };
}
