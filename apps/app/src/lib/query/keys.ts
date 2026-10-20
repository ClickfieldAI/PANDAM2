/** Central query-key factory so invalidation stays consistent. */
import { type MarketKind } from '@/lib/api/market';

export const qk = {
  auth: { me: ['auth', 'me'] as const },
  categories: ['categories'] as const,
  matches: ['matches'] as const,
  market: {
    all: (kind: MarketKind) => ['market', kind] as const,
    discover: (kind: MarketKind, params: Record<string, unknown>) =>
      ['market', kind, 'discover', params] as const,
    mine: (kind: MarketKind) => ['market', kind, 'mine'] as const,
    detail: (kind: MarketKind, id: string) => ['market', kind, 'detail', id] as const,
    cities: ['market', 'cities'] as const,
  },
  recommendations: (limit: number) => ['recommendations', limit] as const,
  offers: {
    all: ['offers'] as const,
    incoming: (status?: string) => ['offers', 'incoming', status ?? 'all'] as const,
    outgoing: (status?: string) => ['offers', 'outgoing', status ?? 'all'] as const,
    detail: (id: string) => ['offers', 'detail', id] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    messages: (id: string) => ['conversations', id, 'messages'] as const,
    typing: (id: string) => ['conversations', id, 'typing'] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    detail: (id: string) => ['transactions', 'detail', id] as const,
  },
  reviews: {
    forUser: (userId: string) => ['reviews', 'user', userId] as const,
  },
  notifications: {
    all: (unreadOnly = false) => ['notifications', unreadOnly] as const,
  },
  account: {
    sessions: ['account', 'sessions'] as const,
  },
  reports: {
    mine: ['reports', 'mine'] as const,
    disputes: (transactionId: string) => ['reports', 'disputes', transactionId] as const,
  },
  blocks: {
    list: ['blocks', 'list'] as const,
  },
  favourites: {
    ids: ['favourites', 'ids'] as const,
    list: ['favourites', 'list'] as const,
  },
  payments: {
    all: ['payments'] as const,
    detail: (id: string) => ['payments', 'detail', id] as const,
  },
};
