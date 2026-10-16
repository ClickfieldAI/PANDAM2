/**
 * Platform fee schedule + calculation (pure — no I/O).
 *
 * A fee is a fixed amount (paise) chosen by which tier the sale amount falls
 * in. The fee is deducted from the SELLER's proceeds: the buyer pays the
 * listing price, the seller receives `amount - fee`, the platform keeps `fee`.
 *
 * The tiers below are SAMPLE values for the client demo — NOT approved
 * commercial rates. Override them with the `PLATFORM_FEE_TIERS` environment
 * variable (a JSON array); no code change is needed.
 */
import { type FeeSchedule, type FeeTier } from '@pandam/types';

/**
 * SAMPLE tiers (₹). Contiguous, no gaps, last tier unbounded. The first tier's
 * `minAmount` is the smallest sale the platform supports (₹10 here), so a flat
 * fee can never swallow a tiny sale.
 */
export const SAMPLE_FEE_TIERS: readonly FeeTier[] = [
  { label: '₹10 – ₹500', minAmount: 1_000, maxAmount: 50_000, feeAmount: 500, enabled: true },
  {
    label: '₹500 – ₹2,000',
    minAmount: 50_001,
    maxAmount: 200_000,
    feeAmount: 2_000,
    enabled: true,
  },
  {
    label: '₹2,000 – ₹10,000',
    minAmount: 200_001,
    maxAmount: 1_000_000,
    feeAmount: 7_500,
    enabled: true,
  },
  {
    label: '₹10,000 – ₹50,000',
    minAmount: 1_000_001,
    maxAmount: 5_000_000,
    feeAmount: 25_000,
    enabled: true,
  },
  {
    label: 'Above ₹50,000',
    minAmount: 5_000_001,
    maxAmount: null,
    feeAmount: 50_000,
    enabled: true,
  },
];

/** Hard ceiling on a demo amount: ₹1 crore, in paise. Keeps arithmetic exact. */
export const MAX_DEMO_AMOUNT = 10_000_000_00;

const isNonNegInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/**
 * Check a tier list is usable: every tier well-formed and sorted (the first
 * tier's minAmount is the minimum supported sale),
 * each tier beginning exactly where the previous ended (no gap, no overlap),
 * and only the last tier unbounded. Returns human-readable problems.
 */
export function validateTiers(tiers: readonly FeeTier[]): string[] {
  const errors: string[] = [];
  if (tiers.length === 0) return ['At least one fee tier is required.'];

  tiers.forEach((t, i) => {
    const n = `Tier ${i + 1}`;
    if (typeof t.label !== 'string' || t.label.trim() === '')
      errors.push(`${n}: label is required.`);
    if (!Number.isSafeInteger(t.minAmount) || t.minAmount < 1)
      errors.push(`${n}: minAmount must be a whole number of at least 1.`);
    if (t.maxAmount !== null && (!Number.isSafeInteger(t.maxAmount) || t.maxAmount < t.minAmount))
      errors.push(`${n}: maxAmount must be null or at least minAmount.`);
    if (!isNonNegInt(t.feeAmount))
      errors.push(`${n}: feeAmount must be a whole number, 0 or more.`);
    if (typeof t.enabled !== 'boolean') errors.push(`${n}: enabled must be true or false.`);
    if (t.maxAmount === null && i !== tiers.length - 1)
      errors.push(`${n}: only the last tier may be unbounded (maxAmount null).`);
    if (t.feeAmount > t.minAmount)
      errors.push(`${n}: feeAmount cannot exceed minAmount (the seller would receive nothing).`);
  });
  if (errors.length > 0) return errors;

  for (let i = 1; i < tiers.length; i += 1) {
    const prev = tiers[i - 1]!;
    const cur = tiers[i]!;
    if (prev.maxAmount === null) break;
    if (cur.minAmount <= prev.maxAmount)
      errors.push(`Tier ${i + 1} overlaps tier ${i} (${cur.minAmount} <= ${prev.maxAmount}).`);
    else if (cur.minAmount > prev.maxAmount + 1)
      errors.push(
        `Gap between tier ${i} and tier ${i + 1}: ${prev.maxAmount + 1}…${cur.minAmount - 1} is uncovered.`,
      );
  }
  if (tiers[tiers.length - 1]!.maxAmount !== null)
    errors.push('The last tier must be unbounded (maxAmount null) so every amount is covered.');
  return errors;
}

/**
 * Resolve the schedule: `PLATFORM_FEE_TIERS` (JSON) if set, else the sample
 * tiers. A malformed or invalid override is reported, never silently used.
 */
export function loadFeeSchedule(raw: string | undefined): FeeSchedule {
  if (raw === undefined || raw.trim() === '') {
    return { source: 'sample', tiers: [...SAMPLE_FEE_TIERS], errors: [], valid: true };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      source: 'env',
      tiers: [],
      errors: ['PLATFORM_FEE_TIERS is not valid JSON.'],
      valid: false,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      source: 'env',
      tiers: [],
      errors: ['PLATFORM_FEE_TIERS must be a JSON array.'],
      valid: false,
    };
  }
  const tiers = parsed as FeeTier[];
  const errors = validateTiers(tiers);
  return {
    source: 'env',
    tiers: errors.length === 0 ? tiers : [],
    errors,
    valid: errors.length === 0,
  };
}

export interface FeeCalculation {
  amount: number;
  feeAmount: number;
  netAmount: number;
  tierIndex: number;
  tier: FeeTier;
}

export class FeeCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeCalculationError';
  }
}

/** Compute the fee for `amount` (paise) against a VALID schedule. */
export function calculateFee(amount: number, tiers: readonly FeeTier[]): FeeCalculation {
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new FeeCalculationError('The amount must be a whole number of paise, at least 1.');
  }
  const minimum = tiers[0]?.minAmount;
  if (minimum !== undefined && amount < minimum) {
    throw new FeeCalculationError(
      `The sale amount is below the minimum supported amount (${minimum} paise).`,
    );
  }
  if (amount > MAX_DEMO_AMOUNT) {
    throw new FeeCalculationError('That amount is above the maximum supported for the demo.');
  }
  const tierIndex = tiers.findIndex(
    (t) => amount >= t.minAmount && (t.maxAmount === null || amount <= t.maxAmount),
  );
  const tier = tiers[tierIndex];
  if (!tier) throw new FeeCalculationError('No fee tier covers that amount.');
  const feeAmount = tier.enabled ? tier.feeAmount : 0;
  if (feeAmount > amount) throw new FeeCalculationError('The fee would exceed the sale amount.');
  return { amount, feeAmount, netAmount: amount - feeAmount, tierIndex, tier };
}
