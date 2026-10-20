import { type ReportStatus } from '@pandam/database/enums';

/**
 * Report review lifecycle. `resolved` and `dismissed` are final: a closed
 * report is a record of a decision, not a draft. A reviewer can hand a report
 * back (`reviewing -> open`) if they cannot finish it.
 */
const NEXT: Record<ReportStatus, readonly ReportStatus[]> = {
  open: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['open', 'resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return NEXT[from].includes(to);
}

/** The statuses from which `to` may be reached — used as the compare-and-swap guard. */
export function reportSourcesFor(to: ReportStatus): ReportStatus[] {
  return (Object.keys(NEXT) as ReportStatus[]).filter((from) => NEXT[from].includes(to));
}

export const isClosedReport = (s: ReportStatus): boolean => s === 'resolved' || s === 'dismissed';
