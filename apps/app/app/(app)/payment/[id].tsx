import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, View } from 'react-native';

import { type PaymentStatus } from '@pandam/types';
import {
  Avatar,
  Button,
  Card,
  Divider,
  Notice,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  layout,
  radii,
  spacing,
  useToast,
  type ThemeColors,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { mediaSrc } from '@/lib/api/media';
import { formatMoney } from '@/lib/format';
import { useCancelPayment, usePayment } from '@/lib/hooks/usePayments';

/**
 * What each payment state means and what to do about it.
 *
 * Money screens are where vague copy does real damage: someone who has just
 * entered card details needs to know, unambiguously, whether they have been
 * charged. Every line here says that explicitly — including the two states
 * where the answer is "no charge was made".
 */
const STATUS_COPY: Record<
  PaymentStatus,
  {
    title: string;
    body: string;
    icon: keyof typeof Ionicons.glyphMap;
    kind: 'info' | 'success' | 'warning' | 'neutral';
  }
> = {
  created: {
    title: 'Waiting for payment',
    body: 'Finish checkout in the browser tab. This page updates by itself the moment Razorpay confirms it — you do not need to refresh.',
    icon: 'time-outline',
    kind: 'info',
  },
  paid: {
    title: 'Payment received',
    body: 'The seller has been told and the listing is marked as sold. Arrange collection with them directly.',
    icon: 'checkmark-circle',
    kind: 'success',
  },
  expired: {
    title: 'Checkout link expired',
    body: 'You have not been charged. Go back to the listing and start again to get a fresh link.',
    icon: 'alert-circle-outline',
    kind: 'warning',
  },
  cancelled: {
    title: 'Payment cancelled',
    body: 'No charge was made.',
    icon: 'close-circle-outline',
    kind: 'neutral',
  },
  refunded: {
    title: 'Refunded',
    body: 'The seller refunded this payment. It can take a few days to appear on your statement.',
    icon: 'return-down-back-outline',
    kind: 'neutral',
  },
};

const makeICON_COLOR = (colors: ThemeColors) =>
  ({
    info: colors.info,
    success: colors.accent,
    warning: colors.warning,
    neutral: colors.textMuted,
  }) as const;

export default function PaymentStatusScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const payment = usePayment(id);
  const cancel = useCancelPayment();

  if (payment.isPending) {
    return (
      <Screen scroll>
        <AppHeader title="Payment" back />
        <SkeletonList count={2} />
      </Screen>
    );
  }
  if (payment.isError) {
    return (
      <Screen scroll>
        <AppHeader title="Payment" back />
        <ErrorState error={payment.error} onRetry={() => void payment.refetch()} />
      </Screen>
    );
  }
  const p = payment.data;
  if (!p) return null;

  const copy = STATUS_COPY[p.status];
  const waiting = p.status === 'created';

  return (
    <Screen
      scroll
      padded={false}
      edges={['top', 'bottom']}
      footer={
        waiting && p.checkoutUrl ? (
          <Stack gap="sm">
            <Button
              label="Open checkout"
              variant="need"
              size="lg"
              fullWidth
              onPress={() => void Linking.openURL(p.checkoutUrl!)}
              leftIcon={<Ionicons name="open-outline" size={17} color={colors.textInverse} />}
            />
            <Button
              label="Cancel this payment"
              variant="quiet"
              fullWidth
              loading={cancel.isPending}
              onPress={() =>
                cancel.mutate(p.id, {
                  onSuccess: () =>
                    toast.show({ message: 'Payment cancelled. You were not charged.' }),
                })
              }
            />
          </Stack>
        ) : p.status === 'paid' ? (
          <Button
            label="Back to Discover"
            size="lg"
            fullWidth
            onPress={() => router.replace('/(app)/(tabs)/discover')}
          />
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
        <AppHeader title="Payment" back />

        <Stack gap="xl">
          {/* ------------------------------------------------------ state -- */}
          <Card padded tone={p.status === 'paid' ? 'accent' : 'surface'}>
            <Stack gap="sm">
              <Row gap="sm">
                {/*
                  A live spinner while waiting, because the page really is
                  polling — a static clock icon would suggest the reader has to
                  do something to make it update.
                */}
                {waiting ? (
                  <ActivityIndicator size="small" color={colors.info} />
                ) : (
                  <Ionicons name={copy.icon} size={20} color={makeICON_COLOR(colors)[copy.kind]} />
                )}
                <Text variant="h3">{copy.title}</Text>
              </Row>
              <Text variant="bodySm" tone="secondary">
                {copy.body}
              </Text>
            </Stack>
          </Card>

          {/* ---------------------------------------------------- receipt -- */}
          <Card padded>
            <Stack gap="md">
              <View style={{ gap: 2 }}>
                <Text variant="h3" numberOfLines={2}>
                  {p.listing.title}
                </Text>
                <Text variant="caption" tone="muted">
                  {p.listing.category.name}
                </Text>
              </View>

              <Divider tone="soft" />

              <Row justify="space-between" align="center">
                <Text variant="bodySm" tone="secondary">
                  Amount
                </Text>
                <Text variant="numericLarge" numeric tone="need">
                  {formatMoney(p.amount, p.currency)}
                </Text>
              </Row>

              <Divider tone="soft" />

              <Row gap="md" align="center">
                <Avatar name={p.seller.displayName} size={32} uri={mediaSrc(p.seller.avatarUrl)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" tone="muted">
                    Sold by
                  </Text>
                  <Text variant="bodySm" numberOfLines={1}>
                    {p.seller.displayName}
                  </Text>
                </View>
              </Row>
            </Stack>
          </Card>

          {/*
            The one thing worth repeating on a money screen: where the card
            details actually go. PANDAM never sees them, and saying so plainly
            is the difference between a payment page people trust and one they
            abandon.
          */}
          <Notice
            kind="info"
            icon={<Ionicons name="lock-closed-outline" size={15} color={colors.info} />}
          >
            Razorpay handles the payment. PANDAM never sees or stores your card or bank details.
          </Notice>

          {waiting ? (
            <Row gap="xs" justify="center">
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: radii.pill,
                  backgroundColor: colors.accent,
                }}
              />
              <Text variant="caption" tone="muted">
                Checking for confirmation…
              </Text>
            </Row>
          ) : null}
        </Stack>
      </View>
    </Screen>
  );
}
