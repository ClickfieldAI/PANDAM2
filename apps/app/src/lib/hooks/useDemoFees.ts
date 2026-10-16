/** TanStack Query hooks for the platform-fee DEMO (simulated sales only). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type DemoFeeQuoteInput } from '@pandam/validation';

import { demoFeesApi } from '@/lib/api/demoFees';

const key = {
  schedule: ['demo-fees', 'schedule'] as const,
  listings: ['demo-fees', 'listings'] as const,
  summary: ['demo-fees', 'summary'] as const,
  quote: (input: DemoFeeQuoteInput | null) => ['demo-fees', 'quote', input] as const,
};

export function useFeeSchedule() {
  return useQuery({
    queryKey: key.schedule,
    queryFn: async () => (await demoFeesApi.schedule()).schedule,
  });
}

export function useDemoSaleListings() {
  return useQuery({
    queryKey: key.listings,
    queryFn: async () => (await demoFeesApi.listings()).items,
  });
}

/** The backend is the only source of the fee — this just asks it. */
export function useFeeQuote(input: DemoFeeQuoteInput | null) {
  return useQuery({
    queryKey: key.quote(input),
    queryFn: async () => (await demoFeesApi.quote(input!)).quote,
    enabled: input !== null,
    retry: false,
    // A quote must always reflect the current schedule.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useConfirmDemoSale() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: demoFeesApi.confirm,
    onSuccess: () => void client.invalidateQueries({ queryKey: key.summary }),
  });
}

export function useDemoRevenueSummary() {
  return useQuery({
    queryKey: key.summary,
    queryFn: async () => (await demoFeesApi.summary()).summary,
  });
}
