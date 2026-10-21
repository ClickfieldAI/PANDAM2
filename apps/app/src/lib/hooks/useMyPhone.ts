/** The caller's own saved mobile number (private; never shown to anyone from here). */
import { useQuery } from '@tanstack/react-query';

import { profileApi } from '@/lib/api/profile';

export function useMyPhone() {
  return useQuery({
    queryKey: ['profile', 'phone'] as const,
    queryFn: async () => (await profileApi.phone()).phone,
    staleTime: 60_000,
  });
}
