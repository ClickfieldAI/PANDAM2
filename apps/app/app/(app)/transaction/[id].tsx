import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { type BarterTransactionView } from '@pandam/types';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  colors,
  layout,
  radii,
  spacing,
  useToast,
  haptic,
  Press,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/lib/api/client';
import { mediaSrc } from '@/lib/api/media';
import { useCreateDispute, useDisputes } from '@/lib/hooks/useReports';
import { useCreateReview } from '@/lib/hooks/useReviews';
import { useSetTransactionStatus, useTransaction } from '@/lib/hooks/useTransactions';

const STATUS_LABEL: Record<BarterTransactionView['status'], string> = {
  created: 'Not started',
  in_progress: 'Under way',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

/**
 * Where the trade has got to.
 *
 * A barter has three real states and the question on this screen is always
 * "whose move is it?". A stepper answers that before you read anything else;
 * a status badge alone tells you the state but not the shape of the journey,
 * so people had to infer how much was left.
 */
function Progress({ status }: { status: BarterTransactionView['status'] }) {
  const steps = ['Agreed', 'Under way', 'Done'] as const;
  const reached =
    status === 'completed' ? 2 : status === 'in_progress' ? 1 : status === 'created' ? 0 : -1;

  // A cancelled or disputed trade has left the happy path; showing a stepper
  // implying it is still progressing would be a lie.
  if (reached < 0) return null;

  return (
    <Row gap="none" align="flex-start">
      {steps.map((label, i) => {
        const done = i <= reached;
        const isLast = i === steps.length - 1;
        return (
          <View key={label} style={{ flex: isLast ? 0 : 1, alignItems: 'flex-start' }}>
            <Row gap="none" align="center" style={{ alignSelf: 'stretch' }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: radii.pill,
                  backgroundColor: done ? colors.accent : colors.surface,
                  borderWidth: done ? 0 : 1.5,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? <Ionicons name="checkmark" size={11} color={colors.textInverse} /> : null}
              </View>
              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: i < reached ? colors.accent : colors.border,
                  }}
                />
              ) : null}
            </Row>
            <Text
              variant="caption"
              tone={done ? 'accent' : 'muted'}
              style={{ marginTop: spacing.xs, marginLeft: isLast ? -8 : 0 }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </Row>
  );
}

/** One side of the completed swap. */
function Side({ label, title, tone }: { label: string; title: string; tone: 'have' | 'need' }) {
  const have = tone === 'have';
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: have ? colors.accentSoft : colors.needSoft,
        borderWidth: 1,
        borderColor: have ? colors.accentBorder : colors.needBorder,
        borderRadius: radii.md,
        padding: spacing.md,
        gap: 2,
      }}
    >
      <Text variant="caption" tone={have ? 'accent' : 'need'} style={{ fontWeight: '600' }}>
        {label}
      </Text>
      <Text variant="bodyStrong" numberOfLines={3}>
        {title}
      </Text>
    </View>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Rating out of five"
      style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Press
          key={n}
          scale="lg"
          haptic="selection"
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ selected: n === value }}
          accessibilityLabel={`${n} ${n === 1 ? 'star' : 'stars'}`}
          hitSlop={6}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={28}
            color={n <= value ? colors.warning : colors.textFaint}
          />
        </Press>
      ))}
    </View>
  );
}

export default function TransactionDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transaction = useTransaction(id);
  const setStatus = useSetTransactionStatus();
  const createReview = useCreateReview();
  const disputes = useDisputes(id);
  const createDispute = useCreateDispute();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  const disputeError =
    createDispute.error instanceof ApiError
      ? createDispute.error.message
      : createDispute.error
        ? 'Could not raise that dispute.'
        : null;

  const reviewError =
    createReview.error instanceof ApiError
      ? createReview.error.message
      : createReview.error
        ? 'Could not submit your review.'
        : null;

  if (transaction.isPending) {
    return (
      <Screen scroll>
        <AppHeader title="Trade" back />
        <SkeletonList count={2} />
      </Screen>
    );
  }
  if (transaction.isError) {
    return (
      <Screen scroll>
        <AppHeader title="Trade" back />
        <ErrorState error={transaction.error} onRetry={() => void transaction.refetch()} />
      </Screen>
    );
  }
  const t = transaction.data;
  if (!t) return null;

  const canStart = t.status === 'created';
  const canComplete = t.status === 'in_progress';
  const canReview = t.status === 'completed' && !t.reviewedByMe && !reviewSubmitted;
  const open = t.status !== 'completed' && t.status !== 'cancelled';

  return (
    <Screen
      scroll
      padded={false}
      edges={['top', 'bottom']}
      footer={
        canStart || canComplete ? (
          <Stack gap="sm">
            <Button
              label={canStart ? 'Mark as under way' : 'Mark as completed'}
              size="lg"
              fullWidth
              loading={setStatus.isPending}
              onPress={() =>
                setStatus.mutate(
                  { id: t.id, action: canStart ? 'start' : 'complete' },
                  {
                    onSuccess: () =>
                      toast.success(
                        canStart ? 'Trade marked as under way.' : 'Trade completed — nice one.',
                      ),
                  },
                )
              }
              leftIcon={<Ionicons name="checkmark-circle" size={17} color={colors.textInverse} />}
            />
            <Text variant="caption" tone="muted" center>
              {canStart
                ? 'Mark this once you have agreed where and when to swap.'
                : 'Mark this once you both have what you agreed.'}
            </Text>
          </Stack>
        ) : undefined
      }
    >
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
        <AppHeader title="Trade" back />

        <Stack gap="xl">
          {/* -------------------------------------------------- who + state -- */}
          <Row gap="md" align="center">
            <Avatar
              name={t.counterparty.displayName}
              size={44}
              uri={mediaSrc(t.counterparty.avatarUrl)}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {t.counterparty.displayName}
              </Text>
              <Text variant="caption" tone="muted">
                Your trading partner
              </Text>
            </View>
            <Badge
              label={STATUS_LABEL[t.status]}
              dot
              kind={
                t.status === 'completed'
                  ? 'success'
                  : t.status === 'cancelled' || t.status === 'disputed'
                    ? 'danger'
                    : 'warning'
              }
            />
          </Row>

          <Progress status={t.status} />

          {/* ------------------------------------------------------- swap -- */}
          <Row gap="sm" align="stretch">
            <Side label="You give" title={t.youGave.title} tone="have" />
            <View style={{ justifyContent: 'center' }}>
              <Ionicons name="swap-horizontal" size={16} color={colors.textFaint} />
            </View>
            <Side label="You get" title={t.youGot.title} tone="need" />
          </Row>

          {open ? (
            <Button
              label="Open the chat"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/(app)/messages')}
              leftIcon={
                <Ionicons name="chatbubbles-outline" size={16} color={colors.textPrimary} />
              }
            />
          ) : null}

          {/* ----------------------------------------------------- review -- */}
          {canReview ? (
            <Card padded>
              <Stack gap="md">
                <View style={{ gap: 2 }}>
                  <Text variant="h3">How did it go?</Text>
                  <Text variant="bodySm" tone="secondary">
                    Your review is public on {t.counterparty.displayName}’s profile. It is the only
                    reputation a barter marketplace has.
                  </Text>
                </View>
                <StarPicker value={rating} onChange={setRating} />
                <Field
                  label="Comment"
                  optional
                  placeholder="Turned up on time, item was as described…"
                  multiline
                  value={comment}
                  onChangeText={setComment}
                />
                {reviewError ? (
                  <Notice
                    kind="danger"
                    icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                  >
                    {reviewError}
                  </Notice>
                ) : null}
                <Button
                  label={createReview.isPending ? 'Submitting…' : 'Submit review'}
                  loading={createReview.isPending}
                  onPress={() =>
                    createReview.mutate(
                      { transactionId: t.id, rating, comment: comment.trim() || undefined },
                      {
                        onSuccess: () => {
                          setReviewSubmitted(true);
                          toast.success('Thanks — your review is live.');
                        },
                      },
                    )
                  }
                />
              </Stack>
            </Card>
          ) : t.status === 'completed' ? (
            <Notice
              kind="success"
              icon={<Ionicons name="checkmark-circle" size={16} color={colors.accent} />}
            >
              {t.reviewedByMe || reviewSubmitted
                ? 'This trade is complete and you have left your review.'
                : 'This trade is complete.'}
            </Notice>
          ) : null}

          {/* --------------------------------------------------- disputes -- */}
          {(disputes.data ?? []).length > 0 ? (
            <Card tone="muted" padded edge="warning">
              <Stack gap="sm">
                <Text variant="bodyStrong">
                  {disputes.data!.length === 1 ? 'A dispute is open' : 'Disputes are open'}
                </Text>
                {disputes.data!.map((d) => (
                  <View key={d.id} style={{ gap: 2 }}>
                    <Text variant="bodySm">
                      {d.mine ? 'You raised' : `${t.counterparty.displayName} raised`}: {d.reason}
                    </Text>
                    {d.details ? (
                      <Text variant="caption" tone="muted">
                        {d.details}
                      </Text>
                    ) : null}
                  </View>
                ))}
                <Text variant="caption" tone="muted">
                  A person reviews every dispute. Keep talking in the chat if you can still sort it
                  out between you.
                </Text>
              </Stack>
            </Card>
          ) : null}

          {/* ---------------------------------------------- quiet actions -- */}
          {/*
            Cancelling, disputing and reporting all sit at the bottom in the
            quietest treatment the system has. They are real and reachable, but
            a trade screen should lead with finishing the trade — not with
            three ways to abandon it.
          */}
          {t.status !== 'created' && !showDispute ? (
            <Row gap="lg" justify="center">
              <Text variant="caption" tone="muted" onPress={() => setShowDispute(true)}>
                Something went wrong?
              </Text>
              <Text
                variant="caption"
                tone="muted"
                onPress={() =>
                  router.push(
                    `/(app)/report?subjectType=user&subjectId=${t.counterparty.id}` +
                      `&label=${encodeURIComponent(t.counterparty.displayName)}`,
                  )
                }
              >
                Report {t.counterparty.displayName.split(' ')[0]}
              </Text>
            </Row>
          ) : null}

          {showDispute ? (
            <Card padded edge="danger">
              <Stack gap="md">
                <View style={{ gap: 2 }}>
                  <Text variant="h3">What went wrong?</Text>
                  <Text variant="bodySm" tone="secondary">
                    A person will read this. Both of you will be able to see it.
                  </Text>
                </View>
                <Field
                  label="In one line"
                  placeholder="They never turned up to swap"
                  value={disputeReason}
                  onChangeText={setDisputeReason}
                />
                {disputeError ? (
                  <Notice
                    kind="danger"
                    icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                  >
                    {disputeError}
                  </Notice>
                ) : null}
                <Row gap="sm">
                  <Button
                    label="Raise dispute"
                    variant="danger"
                    style={{ flex: 1 }}
                    loading={createDispute.isPending}
                    disabled={disputeReason.trim().length < 3}
                    onPress={() =>
                      createDispute.mutate(
                        { transactionId: t.id, reason: disputeReason.trim() },
                        {
                          onSuccess: () => {
                            setDisputeReason('');
                            setShowDispute(false);
                            toast.show({ message: 'Dispute raised. Someone will review it.' });
                          },
                        },
                      )
                    }
                  />
                  <Button label="Cancel" variant="quiet" onPress={() => setShowDispute(false)} />
                </Row>
              </Stack>
            </Card>
          ) : null}

          {open ? (
            <Button
              label="Cancel this trade"
              variant="quiet"
              size="sm"
              onPress={() => {
                haptic.warning();
                Alert.alert(
                  'Cancel this trade?',
                  'Both items stay off the marketplace until one of you re-publishes them. This cannot be undone.',
                  [
                    { text: 'Keep trading', style: 'cancel' },
                    {
                      text: 'Cancel trade',
                      style: 'destructive',
                      onPress: () =>
                        setStatus.mutate(
                          { id: t.id, action: 'cancel' },
                          { onSuccess: () => toast.show({ message: 'Trade cancelled.' }) },
                        ),
                    },
                  ],
                );
              }}
            />
          ) : null}
        </Stack>
      </View>
    </Screen>
  );
}
