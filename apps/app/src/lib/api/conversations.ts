import { type ConversationView, type MessageView, type TypingStatusView } from '@pandam/types';

import { api } from './client';

export const conversationsApi = {
  list: () => api.get<{ items: ConversationView[] }>('/api/v1/conversations'),
  get: (id: string) => api.get<{ conversation: ConversationView }>(`/api/v1/conversations/${id}`),
  markRead: (id: string) => api.post<{ read: true }>(`/api/v1/conversations/${id}/read`),
  messages: (id: string) =>
    api.get<{ items: MessageView[] }>(`/api/v1/conversations/${id}/messages`),
  sendMessage: (id: string, input: { body?: string; imageKey?: string; clientId?: string }) =>
    api.post<{ message: MessageView; replayed: boolean }>(
      `/api/v1/conversations/${id}/messages`,
      input,
    ),
  typing: (id: string) => api.get<TypingStatusView>(`/api/v1/conversations/${id}/typing`),
  setTyping: (id: string, typing: boolean) =>
    api.post<{ typing: boolean }>(`/api/v1/conversations/${id}/typing`, { typing }),
};
