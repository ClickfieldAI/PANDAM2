/**
 * Platform fee — CLIENT DEMO.
 *
 * Pick an existing sale listing (or type an amount), see the platform fee and
 * the seller's net proceeds, then "simulate" the payment. Every number on this
 * screen comes from the backend (`/api/v1/demo-fees`); the app never computes
 * a fee itself. No Razorpay call is made and no money moves — demo rows are
 * flagged and kept apart from real `payments`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { type DemoFeeTransactionView } from '@pandam/types';
import {
  Badge,
  Button,
  Card,
  Input,
  KeyboardScrollView,
  Notice,
  Press,
  Row,
  Screen,
  SegmentedControl,
  Stack,
  Text,
  layout,
  spacing,
  useThemeColors,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ApiError } from '@/lib/api/client';
import { formatMoney, timeAgo } from '@/lib/format';
import {
  useConfirmDemoSale,
  useDemoRevenueSummary,
  useDemoSaleListings,
  useFeeQuote,
  useFeeSchedule,
} from '@/lib/hooks/useDemoFees';
import { useDebounced } from '@/lib/hooks/useDebounced';

type Mode = 'listing' | 'amount';

/** Rupee presets that land in different sample tiers. */
const PRESETS = [300, 1_000, 5_000, 25_000, 75_000];

const newKey = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** "1500" / "1,500.50" → paise, or null when it is not a usable amount. */
function rupeesToPaise(text: string): number | null {
  const n = Number(text.replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'accent' | 'success' | 'primary';
}) {
  return (
    <Row justify="space-between" align="center">
      <Text variant={strong ? 'bodyStrong' : 'body'} tone="secondary">
        {label}
      </Text>
      <Text variant={strong ? 'h3' : 'bodyStrong'} tone={tone ?? 'primary'} numeric>
        {value}
      </Text>
    </Row>
  );
}

export default function PlatformFeeDemoScreen() {
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('amount');
  const [amountText, setAmountText] = useState('1000');
  const [listingId, setListingId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DemoFeeTransactionView | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // One key per "intent to pay"; a retry of the SAME confirmation reuses it.
  const keyRef = useRef(newKey());

  const schedule = useFeeSchedule();
  const listings = useDemoSaleListings();
  const summary = useDemoRevenueSummary();
  const confirm = useConfirmDemoSale();

  const debouncedAmount = useDebounced(amountText, 350);
  const paise = rupeesToPaise(debouncedAmount);
  const input =
    mode === 'listing'
      ? listingId
        ? { listingId }
        : null
      : paise !== null
        ? { amount: paise }
        : null;
  const quote = useFeeQuote(input);
  const quoteError = quote.error instanceof ApiError ? quote.error.message : null;

  const reset = () => {
    setReceipt(null);
    setConfirmError(null);
    keyRef.current = newKey();
  };

  const onInputChange = () => {
    // A different sale is a different payment: never reuse the old key.
    keyRef.current = newKey();
    setConfirmError(null);
    setReceipt(null);
  };

  const simulate = () => {
    if (!quote.data || !input) return;
    setConfirmError(null);
    confirm.mutate(
      {
        ...(input as { listingId: string } | { amount: number }),
        expectedFeeAmount: quote.data.feeAmount,
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: (res) => setReceipt(res.transaction),
        onError: (e) => {
          setConfirmError(e instanceof ApiError ? e.message : 'Could not simulate the payment.');
          // A 409 means the fee changed — pull the fresh quote.
          void quote.refetch();
        },
      },
    );
  };

  const q = quote.data;
  const activeTier = q?.tierIndex ?? -1;

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
        <AppHeader
          title="Platform fee"
          subtitle="Client demo — simulated sales only"
          back
          size="md"
        />
      </View>

      <KeyboardScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: spacing['5xl'],
          paddingTop: spacing.md,
        }}
      >
        <Stack gap="xl">
          <Notice
            kind="warning"
            title="DEMO — no real money"
            icon={<Ionicons name="flask-outline" size={18} color={colors.warningText} />}
          >
            Payments here are simulated. Nothing is charged and Razorpay is not called. Fee tiers
            are sample values for the presentation, not approved commercial rates.
          </Notice>

          {receipt ? (
            <Card padded tone="surface">
              <Stack gap="md">
                <Row justify="space-between" align="center">
                  <Text variant="h2">Simulated payment confirmed</Text>
                  <Badge label="DEMO" kind="warning" variant="solid" />
                </Row>
                <Text variant="caption" tone="muted">
                  No real charge was made. Ref {receipt.id}
                </Text>
                {receipt.listing.title ? (
                  <Text variant="bodyStrong">{receipt.listing.title}</Text>
                ) : null}
                <Line label="Buyer pays" value={formatMoney(receipt.amount, receipt.currency)} />
                <Line
                  label={`Platform fee (${receipt.tierLabel})`}
                  value={`− ${formatMoney(receipt.feeAmount, receipt.currency)}`}
                  tone="accent"
                />
                <Line
                  label="Seller receives"
                  value={formatMoney(receipt.netAmount, receipt.currency)}
                  strong
                  tone="success"
                />
                <Button label="New simulation" variant="secondary" onPress={reset} />
              </Stack>
            </Card>
          ) : (
            <>
              <Stack gap="md">
                <SegmentedControl
                  options={[
                    { value: 'amount', label: 'Enter amount' },
                    { value: 'listing', label: 'Sale listing' },
                  ]}
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    onInputChange();
                  }}
                />

                {mode === 'amount' ? (
                  <Stack gap="sm">
                    <Input
                      value={amountText}
                      onChangeText={(t) => {
                        setAmountText(t);
                        onInputChange();
                      }}
                      keyboardType="decimal-pad"
                      placeholder="Sale amount in ₹"
                      accessibilityLabel="Sale amount in rupees"
                      leftIcon={<Text variant="bodyStrong">₹</Text>}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {PRESETS.map((p) => (
                        <Press
                          key={p}
                          scale="sm"
                          accessibilityRole="button"
                          accessibilityLabel={`Use ₹${p}`}
                          onPress={() => {
                            setAmountText(String(p));
                            onInputChange();
                          }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          }}
                        >
                          <Text variant="label">₹{p.toLocaleString('en-IN')}</Text>
                        </Press>
                      ))}
                    </View>
                  </Stack>
                ) : listings.isPending ? (
                  <Text tone="muted">Loading sale listings…</Text>
                ) : (listings.data ?? []).length === 0 ? (
                  <Notice kind="info">
                    There are no published sale listings yet. Create a listing set to “sale” or
                    “both”, or switch to “Enter amount”.
                  </Notice>
                ) : (
                  <Stack gap="sm">
                    {(listings.data ?? []).map((l) => {
                      const selected = l.id === listingId;
                      return (
                        <Press
                          key={l.id}
                          scale="sm"
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setListingId(l.id);
                            onInputChange();
                          }}
                          style={{
                            padding: 14,
                            borderRadius: 14,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? colors.accent : colors.border,
                            backgroundColor: colors.surface,
                          }}
                        >
                          <Row justify="space-between" align="center">
                            <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={1}>
                              {l.title}
                            </Text>
                            <Text variant="bodyStrong" numeric>
                              {formatMoney(l.amount, l.currency)}
                            </Text>
                          </Row>
                        </Press>
                      );
                    })}
                  </Stack>
                )}
              </Stack>

              <Card padded tone="surface">
                <Stack gap="md">
                  <Text variant="h3">Transaction breakdown</Text>
                  {!input ? (
                    <Text tone="muted">
                      {mode === 'listing' ? 'Pick a sale listing above.' : 'Enter a valid amount.'}
                    </Text>
                  ) : quote.isPending ? (
                    <Text tone="muted">Calculating fee…</Text>
                  ) : quoteError ? (
                    <Notice kind="danger">{quoteError}</Notice>
                  ) : q ? (
                    <>
                      <Line label="Sale amount" value={formatMoney(q.amount, q.currency)} />
                      <Line
                        label={`Platform fee · ${q.tier.label}`}
                        value={`− ${formatMoney(q.feeAmount, q.currency)}`}
                        tone="accent"
                      />
                      <View style={{ height: 1, backgroundColor: colors.borderSoft }} />
                      <Line
                        label="Seller net proceeds"
                        value={formatMoney(q.netAmount, q.currency)}
                        strong
                        tone="success"
                      />
                    </>
                  ) : null}
                  {confirmError ? <Notice kind="danger">{confirmError}</Notice> : null}
                  <Button
                    label="Simulate payment (DEMO)"
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!q}
                    loading={confirm.isPending}
                    onPress={simulate}
                  />
                </Stack>
              </Card>
            </>
          )}

          <Stack gap="sm">
            <Row justify="space-between" align="center">
              <Text variant="h3">Fee tiers</Text>
              <Badge
                label={schedule.data?.source === 'env' ? 'From config' : 'Sample tiers'}
                kind="warning"
              />
            </Row>
            {schedule.data && !schedule.data.valid ? (
              <Notice kind="danger" title="Fee schedule is invalid">
                {schedule.data.errors.join(' ')}
              </Notice>
            ) : null}
            {(schedule.data?.tiers ?? []).map((t, i) => (
              <Row
                key={t.label}
                justify="space-between"
                align="center"
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: i === activeTier ? colors.accentSoft : colors.surface,
                  borderWidth: 1,
                  borderColor: i === activeTier ? colors.accent : colors.borderSoft,
                }}
              >
                <Text variant={i === activeTier ? 'bodyStrong' : 'body'}>{t.label}</Text>
                <Text variant="bodyStrong" numeric>
                  {t.enabled ? formatMoney(t.feeAmount) : 'No fee'}
                </Text>
              </Row>
            ))}
            <Text variant="caption" tone="muted">
              Edited via the PLATFORM_FEE_TIERS setting on the server — no app update needed.
            </Text>
          </Stack>

          <Stack gap="sm">
            <Row justify="space-between" align="center">
              <Text variant="h3">Demo revenue summary</Text>
              <Badge label="Simulated" kind="warning" />
            </Row>
            <Card padded tone="surface">
              <Stack gap="md">
                <Line label="Simulated sales" value={String(summary.data?.count ?? 0)} />
                <Line
                  label="Gross sale value"
                  value={formatMoney(summary.data?.grossAmount ?? 0)}
                />
                <Line
                  label="Platform fees earned"
                  value={formatMoney(summary.data?.feeAmount ?? 0)}
                  strong
                  tone="accent"
                />
                <Line
                  label="Paid out to sellers"
                  value={formatMoney(summary.data?.netAmount ?? 0)}
                />
                {(summary.data?.byTier ?? []).map((t) => (
                  <Row key={t.tierLabel} justify="space-between">
                    <Text variant="caption" tone="muted">
                      {t.tierLabel} · {t.count}×
                    </Text>
                    <Text variant="caption" tone="muted" numeric>
                      {formatMoney(t.feeAmount)}
                    </Text>
                  </Row>
                ))}
                {(summary.data?.recent ?? []).length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label" tone="muted">
                      Recent
                    </Text>
                    {summary.data?.recent.map((r) => (
                      <Row key={r.id} justify="space-between">
                        <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {r.listing.title ?? 'Typed amount'} · {timeAgo(r.createdAt)}
                        </Text>
                        <Text variant="caption" numeric>
                          {formatMoney(r.amount)} → fee {formatMoney(r.feeAmount)}
                        </Text>
                      </Row>
                    ))}
                  </View>
                ) : null}
              </Stack>
            </Card>
          </Stack>
        </Stack>
      </KeyboardScrollView>
    </Screen>
  );
}
