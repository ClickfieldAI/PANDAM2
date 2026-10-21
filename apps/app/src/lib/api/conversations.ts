import {
  type ContactView,
  type ConversationView,
  type MessageView,
  type SharedLocation,
  type TypingStatusView,
} from '@pandam/types';

import { api } from './client';

/** What a message can carry: text, a photo, a video (with its thumbnail photo) or a location. */
export interface SendMessageInput {
  body?: string;
  imageKey?: string;
  videoKey?: string;
  location?: SharedLocation | { latitude: number; longitude: number; placeName?: string };
  clientId?: string;
}

export const conversationsApi = {
  list: () => api.get<{ items: ConversationView[] }>('/api/v1/conversations'),
  get: (id: string) => api.get<{ conversation: ConversationView }>(`/api/v1/conversations/${id}`),
  markRead: (id: string) => api.post<{ read: true }>(`/api/v1/conversations/${id}/read`),
  messages: (id: string) =>
    api.get<{ items: MessageView[] }>(`/api/v1/conversations/${id}/messages`),
  /** The other person's number: only while the trade is accepted and live (403 otherwise). */
  contact: (id: string) => api.get<ContactView>(`/api/v1/conversations/${id}/contact`),
  sendMessage: (id: string, input: SendMessageInput) =>
    api.post<{ message: MessageView; replayed: boolean }>(
      `/api/v1/conversations/${id}/messages`,
      input,
    ),
  typing: (id: string) => api.get<TypingStatusView>(`/api/v1/conversations/${id}/typing`),
  setTyping: (id: string, typing: boolean) =>
    api.post<{ typing: boolean }>(`/api/v1/conversations/${id}/typing`, { typing }),
};
