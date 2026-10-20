/** TanStack Query hooks for barter offers. */
import { type CounterOfferInput, type CreateOfferInput } from '@pandam/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { offersApi, type OfferAction } from '@/lib/api/offers';
import { qk } from '@/lib/query/keys';

export function useIncomingOffers(status?: string) {
  return useQuery({
    queryKey: qk.offers.incoming(status),
    queryFn: async () => (await offersApi.incoming(status)).items,
    staleTime: 15_000,
  });
}

export function useOutgoingOffers(status?: string) {
  return useQuery({
    queryKey: qk.offers.outgoing(status),
    queryFn: async () => (await offersApi.outgoing(status)).items,
    staleTime: 15_000,
  });
}

export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: qk.offers.detail(id ?? ''),
    queryFn: async () => (await offersApi.get(id!)).offer,
    enabled: !!id,
  });
}

function invalidateOfferGraphs(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: qk.offers.all });
  void client.invalidateQueries({ queryKey: qk.conversations.all });
  void client.invalidateQueries({ queryKey: qk.transactions.all });
  void client.invalidateQueries({ queryKey: qk.matches });
  void client.invalidateQueries({ queryKey: ['market'] });
  void client.invalidateQueries({ queryKey: ['notifications'] });
}

export function useCreateOffer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOfferInput) => offersApi.create(input),
    onSuccess: () => invalidateOfferGraphs(client),
  });
}

export function useCounterOffer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CounterOfferInput }) =>
      offersApi.counter(id, input),
    onSuccess: () => invalidateOfferGraphs(client),
  });
}

/** The whole negotiation (original offer and every counter), oldest first. */
export function useOfferHistory(id: string | undefined) {
  return useQuery({
    queryKey: [...qk.offers.detail(id ?? ''), 'history'] as const,
    queryFn: async () => (await offersApi.history(id!)).items,
    enabled: !!id,
  });
}

export function useRespondToOffer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: OfferAction }) =>
      offersApi.respond(id, action),
    onSuccess: (res) => {
      client.setQueryData(qk.offers.detail(res.offer.id), res.offer);
      invalidateOfferGraphs(client);
    },
  });
}
