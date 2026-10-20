import { useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';

import {
  type AdminReportView,
  type AdminTransactionView,
  type AdminUserView,
  type ReportStatus,
} from '@pandam/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Screen,
  SegmentedControl,
  SkeletonList,
  Stack,
  Text,
  layout,
  spacing,
  useToast,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/hooks';
import { timeAgo } from '@/lib/format';
import {
  useAdminActions,
  useAdminAudit,
  useAdminReport,
  useAdminReports,
  useAdminTransaction,
  useAdminTransactions,
  useAdminUsers,
} from '@/lib/hooks/useAdmin';

type Tab = 'reports' | 'users' | 'trades' | 'audit';

/**
 * Staff tools. This screen is only reachable for moderators and admins (the
 * Profile entry is hidden otherwise and this redirects), but that is a
 * convenience: every call below is enforced by the server.
 */
export default function AdminScreen() {
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('reports');

  if (!user || (user.role !== 'moderator' && user.role !== 'admin')) {
    return <Redirect href="/(app)/(tabs)/profile" />;
  }
  const isAdmin = user.role === 'admin';
  const tabs = [
    { value: 'reports' as const, label: 'Reports' },
    { value: 'users' as const, label: 'Users' },
    { value: 'trades' as const, label: 'Trades' },
    ...(isAdmin ? [{ value: 'audit' as const, label: 'Audit' }] : []),
  ];

  return (
    <Screen scroll padded={false} edges={['top', 'bottom']}>
      <View
        style={{
          width: '100%',
          maxWidth: layout.contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: layout.gutter,
          paddingTop: spacing.lg,
          paddingBottom: spacing['3xl'],
        }}
      >
        <AppHeader
          title="Moderation"
          subtitle={`Signed in as ${user.role}. Every action here needs a reason and is logged.`}
          back
        />
        <Stack gap="lg">
          <SegmentedControl options={tabs} value={tab} onChange={setTab} />
          {tab === 'reports' && <ReportsTab />}
          {tab === 'users' && <UsersTab isAdmin={isAdmin} />}
          {tab === 'trades' && <TradesTab />}
          {tab === 'audit' && isAdmin && <AuditTab />}
        </Stack>
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ pieces */

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/**
 * A destructive action that asks for the reason first. No window.prompt: this
 * has to work on a phone, so the reason is a field right under the button.
 */
function ReasonAction({
  label,
  variant = 'secondary',
  confirmLabel,
  loading,
  onSubmit,
}: {
  label: string;
  variant?: 'secondary' | 'danger' | 'primary';
  confirmLabel?: string;
  loading?: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return <Button label={label} variant={variant} size="sm" onPress={() => setOpen(true)} />;
  }
  const ok = reason.trim().length >= 5;
  return (
    <Stack gap="sm">
      <Input
        value={reason}
        onChangeText={setReason}
        placeholder="Reason (at least 5 characters, recorded in the audit log)"
        multiline
        maxLength={500}
        accessibilityLabel={`Reason for: ${label}`}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label={confirmLabel ?? label}
          variant={variant}
          size="sm"
          disabled={!ok}
          loading={loading}
          onPress={() => onSubmit(reason.trim())}
        />
        <Button label="Cancel" variant="ghost" size="sm" onPress={() => setOpen(false)} />
      </View>
    </Stack>
  );
}

const statusKind = (s: string) =>
  s === 'open' || s === 'disputed'
    ? 'warning'
    : s === 'reviewing' || s === 'in_progress'
      ? 'info'
      : s === 'resolved' || s === 'completed' || s === 'active'
        ? 'success'
        : s === 'suspended'
          ? 'danger'
          : 'neutral';

function Load({
  q,
  empty,
  children,
}: {
  q: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    data?: unknown[];
  };
  empty: string;
  children: React.ReactNode;
}) {
  if (q.isPending) return <SkeletonList count={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if ((q.data ?? []).length === 0) return <EmptyState title={empty} />;
  return <>{children}</>;
}

/* ----------------------------------------------------------------- reports */

const REPORT_FILTERS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'all', label: 'All' },
];

function ReportsTab() {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('open');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminReports(filter === 'all' ? undefined : filter);

  return (
    <Stack gap="md">
      <SegmentedControl options={REPORT_FILTERS} value={filter} onChange={setFilter} />
      <Load q={q} empty="No reports here.">
        {(q.data ?? []).map((r) => (
          <ReportRow
            key={r.id}
            report={r}
            open={selected === r.id}
            onToggle={() => setSelected(selected === r.id ? null : r.id)}
          />
        ))}
      </Load>
    </Stack>
  );
}

function ReportRow({
  report,
  open,
  onToggle,
}: {
  report: AdminReportView;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card onPress={onToggle}>
      <Stack gap="sm">
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Badge label={report.status} kind={statusKind(report.status)} />
          <Badge label={report.subjectType} kind="neutral" variant="outline" />
          <Badge label={report.reason} kind="neutral" variant="outline" />
        </View>
        <Text variant="caption" tone="muted">
          Filed {timeAgo(report.createdAt)}
        </Text>
        {open && <ReportDetail id={report.id} />}
      </Stack>
    </Card>
  );
}

function ReportDetail({ id }: { id: string }) {
  const detail = useAdminReport(id);
  const act = useAdminActions();
  const toast = useToast();
  if (detail.isPending) return <SkeletonList count={1} />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const r = detail.data;
  const closed = r.status === 'resolved' || r.status === 'dismissed';
  const kind = r.subjectType === 'listing' || r.subjectType === 'need' ? r.subjectType : null;
  const done = (msg: string) => ({
    onSuccess: () => toast.success(msg),
    onError: (e: unknown) => toast.error(messageOf(e, 'That did not work.')),
  });

  return (
    <Stack gap="md">
      {r.details ? <Text>{r.details}</Text> : null}
      <Stack gap="xs">
        <Text variant="bodyStrong">Reported ({r.subjectType})</Text>
        <Text>
          {r.subject.exists ? (r.subject.label ?? 'Exists, no label') : 'No longer exists'}
          {r.subject.status ? ` · ${r.subject.status}` : ''}
          {r.subject.takenDown ? ' · removed by moderation' : ''}
        </Text>
        {r.snapshot ? (
          <Text variant="caption" tone="muted">
            When reported: {JSON.stringify(r.snapshot).slice(0, 300)}
          </Text>
        ) : null}
      </Stack>
      <Text variant="caption" tone="muted">
        Reporter: {r.reporter?.displayName ?? r.reporterId} · {r.related.length} other report
        {r.related.length === 1 ? '' : 's'} on this
      </Text>
      {r.resolutionNote ? <Text variant="caption">Decision: {r.resolutionNote}</Text> : null}

      {!closed && (
        <Stack gap="sm">
          {r.status === 'open' && (
            <Button
              label="Start review"
              size="sm"
              loading={act.review.isPending}
              onPress={() =>
                act.review.mutate({ id, status: 'reviewing' }, done('Marked as reviewing.'))
              }
            />
          )}
          <ReasonAction
            label="Resolve"
            variant="primary"
            loading={act.review.isPending}
            onSubmit={(note) =>
              act.review.mutate({ id, status: 'resolved', note }, done('Report resolved.'))
            }
          />
          <ReasonAction
            label="Dismiss"
            loading={act.review.isPending}
            onSubmit={(note) =>
              act.review.mutate({ id, status: 'dismissed', note }, done('Report dismissed.'))
            }
          />
        </Stack>
      )}

      {kind && r.subject.exists && (
        <ReasonAction
          label={r.subject.takenDown ? 'Reinstate item' : 'Take down item'}
          variant={r.subject.takenDown ? 'secondary' : 'danger'}
          loading={act.takedown.isPending || act.reinstate.isPending}
          onSubmit={(reason) =>
            r.subject.takenDown
              ? act.reinstate.mutate({ kind, id: r.subjectId, reason }, done('Item reinstated.'))
              : act.takedown.mutate({ kind, id: r.subjectId, reason }, done('Item taken down.'))
          }
        />
      )}
      {r.subjectType === 'user' && r.subject.exists && r.subject.status === 'active' && (
        <ReasonAction
          label="Suspend user"
          variant="danger"
          loading={act.suspend.isPending}
          onSubmit={(reason) =>
            act.suspend.mutate({ id: r.subjectId, reason }, done('User suspended.'))
          }
        />
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------- users */

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminUsers(query);

  return (
    <Stack gap="md">
      <Input
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => setQuery(text.trim())}
        returnKeyType="search"
        placeholder="Search by email or user id, then press search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search users"
      />
      <Button label="Search" size="sm" variant="secondary" onPress={() => setQuery(text.trim())} />
      <Load q={q} empty="No users match.">
        {(q.data ?? []).map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isAdmin={isAdmin}
            open={selected === u.id}
            onToggle={() => setSelected(selected === u.id ? null : u.id)}
          />
        ))}
      </Load>
    </Stack>
  );
}

function UserRow({
  user,
  isAdmin,
  open,
  onToggle,
}: {
  user: AdminUserView;
  isAdmin: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const act = useAdminActions();
  const toast = useToast();
  const done = (msg: string) => ({
    onSuccess: () => toast.success(msg),
    onError: (e: unknown) => toast.error(messageOf(e, 'That did not work.')),
  });
  return (
    <Card onPress={onToggle}>
      <Stack gap="sm">
        <Text variant="bodyStrong">{user.displayName ?? '(no profile)'}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Badge label={user.status} kind={statusKind(user.status)} />
          {user.role !== 'user' && <Badge label={user.role} kind="info" />}
        </View>
        {open && (
          <Stack gap="sm">
            <Text variant="caption" tone="muted">
              {user.email} · joined {timeAgo(user.createdAt)}
            </Text>
            {user.suspensionReason ? (
              <Text variant="caption">Suspended: {user.suspensionReason}</Text>
            ) : null}
            {user.status === 'active' ? (
              <ReasonAction
                label="Suspend"
                variant="danger"
                loading={act.suspend.isPending}
                onSubmit={(reason) =>
                  act.suspend.mutate({ id: user.id, reason }, done('User suspended.'))
                }
              />
            ) : user.status === 'suspended' ? (
              <ReasonAction
                label="Unsuspend"
                loading={act.unsuspend.isPending}
                onSubmit={(reason) =>
                  act.unsuspend.mutate({ id: user.id, reason }, done('User unsuspended.'))
                }
              />
            ) : null}
            {isAdmin && user.status === 'active' && (
              <ReasonAction
                label={user.role === 'user' ? 'Make moderator' : 'Make ordinary user'}
                loading={act.setRole.isPending}
                onSubmit={(reason) =>
                  act.setRole.mutate(
                    { id: user.id, role: user.role === 'user' ? 'moderator' : 'user', reason },
                    done('Role changed.'),
                  )
                }
              />
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/* ------------------------------------------------------------------ trades */

function TradesTab() {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'disputed' | 'in_progress'>('disputed');
  const q = useAdminTransactions(status === 'all' ? undefined : status);
  return (
    <Stack gap="md">
      <SegmentedControl
        options={[
          { value: 'disputed' as const, label: 'Disputed' },
          { value: 'in_progress' as const, label: 'In progress' },
          { value: 'all' as const, label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <Text variant="caption" tone="muted">
        Read-only. Staff cannot change a trade.
      </Text>
      <Load q={q} empty="No trades here.">
        {(q.data ?? []).map((t) => (
          <TradeRow
            key={t.id}
            trade={t}
            open={selected === t.id}
            onToggle={() => setSelected(selected === t.id ? null : t.id)}
          />
        ))}
      </Load>
    </Stack>
  );
}

function TradeRow({
  trade,
  open,
  onToggle,
}: {
  trade: AdminTransactionView;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card onPress={onToggle}>
      <Stack gap="sm">
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Badge label={trade.status} kind={statusKind(trade.status)} />
        </View>
        <Text variant="caption" tone="muted">
          Started {timeAgo(trade.createdAt)} · confirmed by{' '}
          {Number(trade.initiatorConfirmed) + Number(trade.counterpartyConfirmed)} of 2
        </Text>
        {open && <TradeDetail id={trade.id} />}
      </Stack>
    </Card>
  );
}

function TradeDetail({ id }: { id: string }) {
  const d = useAdminTransaction(id);
  if (d.isPending) return <SkeletonList count={1} />;
  if (d.isError) return <ErrorState error={d.error} onRetry={() => void d.refetch()} />;
  const t = d.data;
  return (
    <Stack gap="xs">
      <Text>
        {t.offeredItem?.title ?? 'Unknown item'} ⇄ {t.requestedItem?.title ?? 'Unknown item'}
      </Text>
      {t.events.map((e, i) => (
        <Text key={i} variant="caption" tone="muted">
          {e.type} · {timeAgo(e.createdAt)}
        </Text>
      ))}
      {t.disputes.map((x) => (
        <Text key={x.id} variant="caption">
          Dispute ({x.status}): {x.reason}
        </Text>
      ))}
    </Stack>
  );
}

/* ------------------------------------------------------------------- audit */

function AuditTab() {
  const q = useAdminAudit(true);
  return (
    <Load q={q} empty="Nothing has been logged yet.">
      {(q.data ?? []).map((a) => (
        <Card key={a.id}>
          <Stack gap="xs">
            <Text variant="bodyStrong">{a.action}</Text>
            <Text variant="caption" tone="muted">
              {a.targetType} {a.targetId.slice(0, 12)} · by {a.actorId.slice(0, 12)} ·{' '}
              {timeAgo(a.createdAt)}
            </Text>
            {a.reason ? <Text variant="caption">{a.reason}</Text> : null}
          </Stack>
        </Card>
      ))}
    </Load>
  );
}
