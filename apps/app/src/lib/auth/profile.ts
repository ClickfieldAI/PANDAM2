import { type AuthenticatedUser, type PublicProfile } from '@pandam/types';
import { type PatchProfileInput } from '@pandam/validation';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { profileApi } from '@/lib/api/profile';

import { authKeys } from './hooks';

/**
 * Put the saved profile into the session cache and refresh every cached list
 * that embeds the user's name or photo (item owners, offers, chats, matches,
 * transactions) so no screen keeps showing the old identity.
 */
export function applySavedProfile(qc: QueryClient, profile: PublicProfile) {
  qc.setQueryData<AuthenticatedUser>(authKeys.me, (prev) => (prev ? { ...prev, profile } : prev));
  void qc.invalidateQueries({
    predicate: (q) =>
      ['market', 'matches', 'offers', 'conversations', 'transactions'].includes(
        String(q.queryKey[0]),
      ),
  });
}

/** Update the signed-in user's profile and refresh the cached `me` entry. */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchProfileInput) => profileApi.patch(input),
    onSuccess: ({ profile }) => applySavedProfile(qc, profile),
  });
}
