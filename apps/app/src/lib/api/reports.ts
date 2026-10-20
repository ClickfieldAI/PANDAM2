/**
 * Abuse reports and transaction disputes.
 *
 * Filing a report never changes what anyone can see — it records something for
 * a human to review. The UI says so, because a "report" button that silently
 * does nothing visible otherwise reads as broken.
 */
import { type CreateDisputeInput, type CreateReportInput } from '@pandam/validation';

import { api } from './client';

export interface ReportView {
  id: string;
  subjectType: CreateReportInput['subjectType'];
  subjectId: string;
  reason: CreateReportInput['reason'];
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt: number;
}

export interface DisputeView {
  id: string;
  transactionId: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'rejected';
  /** True when the caller is the one who raised it. */
  mine: boolean;
  createdAt: number;
}

export const reportsApi = {
  create: (input: CreateReportInput) =>
    api.post<{ report: ReportView; duplicate: boolean }>('/api/v1/reports', input),
  mine: () => api.get<{ items: ReportView[] }>('/api/v1/reports/mine'),

  createDispute: (input: CreateDisputeInput) =>
    api.post<{ dispute: DisputeView }>('/api/v1/reports/disputes', input),
  disputesFor: (transactionId: string) =>
    api.get<{ items: DisputeView[] }>(`/api/v1/reports/disputes/${transactionId}`),
};
