import { type PublicProfile } from '@pandam/types';
import { type PatchProfileInput, type PutProfileInput } from '@pandam/validation';

import { api } from './client';

export const profileApi = {
  get: () => api.get<{ profile: PublicProfile | null }>('/api/v1/profiles/me'),
  put: (input: PutProfileInput) =>
    api.put<{ profile: PublicProfile }>('/api/v1/profiles/me', input),
  /** Your own saved mobile number (E.164) or null. Private to you. */
  phone: () => api.get<{ phone: string | null }>('/api/v1/profiles/me/phone'),
  setPhone: (phone: string) => api.put<{ phone: string }>('/api/v1/profiles/me/phone', { phone }),
  patch: (input: PatchProfileInput) =>
    api.patch<{ profile: PublicProfile }>('/api/v1/profiles/me', input),
};
