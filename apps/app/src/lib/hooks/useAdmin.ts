/** TanStack Query hooks for the staff screens. Server state only. */
import { type ReportStatus, type UserRole } from '@pandam/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminApi } from '@/lib/api/admin';

const key = (...rest: unknown[]) => ['admin', ...rest] as const;

export const useAdminReports = (status?: ReportStatus) =>
  useQuery({
    queryKey: key('reports', status ?? 'all'),
    queryFn: async () => (await adminApi.reports({ status, limit: 50 })).items,
  });

export const useAdminReport = (id: string | null) =>
  useQuery({
    queryKey: key('report', id),
    queryFn: async () => (await adminApi.report(id!)).report,
    enabled: !!id,
  });

export const useAdminUsers = (q: string) =>
  useQuery({
    queryKey: key('users', q),
    queryFn: async () => (await adminApi.users({ q: q || undefined, limit: 30 })).items,
  });

export const useAdminTransactions = (status?: string) =>
  useQuery({
    queryKey: key('transactions', status ?? 'all'),
    queryFn: async () => (await adminApi.transactions({ status, limit: 50 })).items,
  });

export const useAdminTransaction = (id: string | null) =>
  useQuery({
    queryKey: key('transaction', id),
    queryFn: async () => (await adminApi.transaction(id!)).transaction,
    enabled: !!id,
  });

export const useAdminAudit = (enabled: boolean) =>
  useQuery({
    queryKey: key('audit'),
    queryFn: async () => (await adminApi.audit({ limit: 50 })).items,
    enabled,
  });

/** Any staff action can change several lists; refresh them all. */
function useRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: ['admin'] });
}

export function useAdminActions() {
  const refresh = useRefresh();
  const opts = { onSuccess: refresh };
  return {
    suspend: useMutation({
      mutationFn: (v: { id: string; reason: string }) => adminApi.suspend(v.id, v.reason),
      ...opts,
    }),
    unsuspend: useMutation({
      mutationFn: (v: { id: string; reason: string }) => adminApi.unsuspend(v.id, v.reason),
      ...opts,
    }),
    setRole: useMutation({
      mutationFn: (v: { id: string; role: UserRole; reason: string }) =>
        adminApi.setRole(v.id, v.role, v.reason),
      ...opts,
    }),
    review: useMutation({
      mutationFn: (v: { id: string; status: ReportStatus; note?: string }) =>
        adminApi.review(v.id, v.status, v.note),
      ...opts,
    }),
    takedown: useMutation({
      mutationFn: (v: { kind: 'listing' | 'need'; id: string; reason: string }) =>
        adminApi.takedown(v.kind, v.id, v.reason),
      ...opts,
    }),
    reinstate: useMutation({
      mutationFn: (v: { kind: 'listing' | 'need'; id: string; reason: string }) =>
        adminApi.reinstate(v.kind, v.id, v.reason),
      ...opts,
    }),
  };
}
