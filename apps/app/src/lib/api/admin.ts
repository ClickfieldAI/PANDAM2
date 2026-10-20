import {
  type AdminAuditView,
  type AdminItemView,
  type AdminReportDetail,
  type AdminReportView,
  type AdminTransactionDetail,
  type AdminTransactionView,
  type AdminUserView,
  type ReportStatus,
  type UserRole,
} from '@pandam/types';

import { api } from './client';

const qs = (params: Record<string, string | number | undefined>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
};

/** Staff endpoints. The server enforces the role on every call; these just call them. */
export const adminApi = {
  users: (p: { q?: string; limit?: number }) =>
    api.get<{ items: AdminUserView[] }>(`/api/v1/admin/users${qs(p)}`),
  user: (id: string) =>
    api.get<{ user: AdminUserView; reportsAboutUser: AdminReportView[] }>(
      `/api/v1/admin/users/${id}`,
    ),
  suspend: (id: string, reason: string) =>
    api.post<{ user: AdminUserView }>(`/api/v1/admin/users/${id}/suspend`, { reason }),
  unsuspend: (id: string, reason: string) =>
    api.post<{ user: AdminUserView }>(`/api/v1/admin/users/${id}/unsuspend`, { reason }),
  setRole: (id: string, role: UserRole, reason: string) =>
    api.post<{ user: AdminUserView }>(`/api/v1/admin/users/${id}/role`, { role, reason }),

  reports: (p: { status?: ReportStatus; limit?: number }) =>
    api.get<{ items: AdminReportView[] }>(`/api/v1/admin/reports${qs(p)}`),
  report: (id: string) => api.get<{ report: AdminReportDetail }>(`/api/v1/admin/reports/${id}`),
  review: (id: string, status: ReportStatus, note?: string) =>
    api.post<{ report: AdminReportView }>(`/api/v1/admin/reports/${id}/review`, { status, note }),

  takedown: (kind: 'listing' | 'need', id: string, reason: string) =>
    api.post<{ item: AdminItemView; withdrawnOffers: number }>(
      `/api/v1/admin/${kind}s/${id}/takedown`,
      { reason },
    ),
  reinstate: (kind: 'listing' | 'need', id: string, reason: string) =>
    api.post<{ item: AdminItemView }>(`/api/v1/admin/${kind}s/${id}/reinstate`, { reason }),

  transactions: (p: { status?: string; limit?: number }) =>
    api.get<{ items: AdminTransactionView[] }>(`/api/v1/admin/transactions${qs(p)}`),
  transaction: (id: string) =>
    api.get<{ transaction: AdminTransactionDetail }>(`/api/v1/admin/transactions/${id}`),

  audit: (p: { limit?: number }) =>
    api.get<{ items: AdminAuditView[] }>(`/api/v1/admin/audit${qs(p)}`),
};
