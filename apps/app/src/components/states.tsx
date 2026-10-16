/**
 * Shared loading / error / empty presentation so every screen behaves the same.
 * Never render a blank screen while data loads.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';

import { EmptyState, SkeletonList } from '@pandam/ui';
import { useThemeColors } from '@pandam/ui';

import { ApiError } from '@/lib/api/client';

/**
 * The failure state for a query.
 *
 * Every branch here answers two questions — what happened, and what can I do
 * about it. "Something went wrong" on its own is the worst possible error
 * message: it tells the reader they are stuck without telling them whether to
 * wait, retry, or give up. So an offline error says to check the connection,
 * a 5xx says it is our fault and worth retrying, a 404 says the thing is gone
 * and retrying will not help, and only a genuinely unknown failure falls back
 * to the generic line.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const colors = useThemeColors();

  const api = error instanceof ApiError ? error : null;
  const network = api?.status === 0;
  const forbidden = api?.status === 401 || api?.status === 403;
  const missing = api?.status === 404;
  const server = (api?.status ?? 0) >= 500;

  // Retrying a 404 or a permission failure just fails again, so the button is
  // withheld rather than offering an action that cannot work.
  const retryable = !missing && !forbidden;

  const { icon, title, body } = network
    ? {
        icon: 'cloud-offline-outline' as const,
        title: 'You appear to be offline',
        body: 'Check your connection — nothing has been lost, and this will load as soon as you are back.',
      }
    : forbidden
      ? {
          icon: 'lock-closed-outline' as const,
          title: 'You do not have access to this',
          body: 'It may belong to someone else, or your session may have ended. Try signing in again.',
        }
      : missing
        ? {
            icon: 'help-circle-outline' as const,
            title: 'This is no longer here',
            body: 'It was probably removed or traded away. The link may also be out of date.',
          }
        : server
          ? {
              icon: 'alert-circle-outline' as const,
              title: 'PANDAM had a problem',
              body: 'This one is on us, not you. Trying again usually works.',
            }
          : {
              icon: 'alert-circle-outline' as const,
              title: 'Something went wrong',
              body: api?.message ?? 'An unexpected error occurred. Try again in a moment.',
            };

  return (
    <EmptyState
      tone="neutral"
      icon={<Ionicons name={icon} size={22} color={colors.textSecondary} />}
      title={title}
      body={body}
      actionLabel={onRetry && retryable ? 'Try again' : undefined}
      onAction={retryable ? onRetry : undefined}
      actionVariant="secondary"
    />
  );
}

export interface QueryStateProps {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  skeleton?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
}

/** Branch on a query's state; falls back to a skeleton list + empty state. */
export function QueryState({
  isPending,
  isError,
  error,
  isEmpty,
  onRetry,
  skeleton,
  empty,
  children,
}: QueryStateProps) {
  if (isPending) return <>{skeleton ?? <SkeletonList />}</>;
  if (isError) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children}</>;
}
