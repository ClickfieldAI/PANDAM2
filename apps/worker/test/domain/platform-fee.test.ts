import { type FeeTier } from '@pandam/types';
import { describe, expect, it } from 'vitest';

import {
  MAX_DEMO_AMOUNT,
  SAMPLE_FEE_TIERS,
  FeeCalculationError,
  calculateFee,
  loadFeeSchedule,
  validateTiers,
} from '../../src/domain/platform-fee';

const tier = (over: Partial<FeeTier>): FeeTier => ({
  label: 'T',
  minAmount: 1,
  maxAmount: null,
  feeAmount: 1,
  enabled: true,
  ...over,
});

describe('sample fee schedule', () => {
  it('is valid (contiguous, no gaps/overlaps, unbounded last tier)', () => {
    expect(validateTiers(SAMPLE_FEE_TIERS)).toEqual([]);
  });

  it('charges the right fee at every tier boundary', () => {
    const cases: [number, number][] = [
      [1_000, 500], // minimum supported amount = start of tier 1
      [50_000, 500], // maximum of tier 1
      [50_001, 2_000], // just above → tier 2
      [200_000, 2_000],
      [200_001, 7_500],
      [1_000_000, 7_500],
      [1_000_001, 25_000],
      [5_000_000, 25_000],
      [5_000_001, 50_000], // first unbounded value
      [MAX_DEMO_AMOUNT, 50_000], // largest supported amount
    ];
    for (const [amount, fee] of cases) {
      const r = calculateFee(amount, SAMPLE_FEE_TIERS);
      expect(r.feeAmount, `amount ${amount}`).toBe(fee);
      expect(r.netAmount).toBe(amount - fee);
    }
  });

  it('net + fee always equals the sale amount', () => {
    for (const amount of [1_000, 1_777, 50_000, 123_456, 9_999_999]) {
      const r = calculateFee(amount, SAMPLE_FEE_TIERS);
      expect(r.feeAmount + r.netAmount).toBe(amount);
    }
  });
});

describe('calculateFee input rules', () => {
  it('rejects amounts below the minimum supported sale (first tier start)', () => {
    expect(() => calculateFee(999, SAMPLE_FEE_TIERS)).toThrow(/minimum/);
    expect(calculateFee(1_000, SAMPLE_FEE_TIERS).netAmount).toBe(500);
  });

  it('rejects zero, negative, fractional, NaN and over-limit amounts', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_DEMO_AMOUNT + 1]) {
      expect(() => calculateFee(bad, SAMPLE_FEE_TIERS), String(bad)).toThrow(FeeCalculationError);
    }
  });

  it('rejects an amount smaller than the fee that would apply', () => {
    // A tier whose fee exceeds its own minimum is invalid config…
    expect(validateTiers([tier({ minAmount: 10, feeAmount: 20 })]).join(' ')).toMatch(
      /cannot exceed/,
    );
    // …and calculateFee still refuses it defensively if one slips through.
    expect(() => calculateFee(10, [tier({ minAmount: 1, feeAmount: 20 })])).toThrow(
      FeeCalculationError,
    );
  });

  it('charges nothing for a disabled tier', () => {
    const tiers = [
      tier({ minAmount: 10, maxAmount: 100, feeAmount: 5, enabled: false }),
      tier({ minAmount: 101, maxAmount: null, feeAmount: 9 }),
    ];
    expect(calculateFee(50, tiers).feeAmount).toBe(0);
    expect(calculateFee(50, tiers).tier.enabled).toBe(false);
    expect(calculateFee(101, tiers).feeAmount).toBe(9);
  });
});

describe('validateTiers', () => {
  it('rejects an empty schedule', () => {
    expect(validateTiers([])).not.toEqual([]);
  });

  it('detects overlapping ranges', () => {
    const errs = validateTiers([
      tier({ minAmount: 1, maxAmount: 100 }),
      tier({ minAmount: 100, maxAmount: null }),
    ]);
    expect(errs.join(' ')).toMatch(/overlap/i);
  });

  it('detects gaps', () => {
    const errs = validateTiers([
      tier({ minAmount: 1, maxAmount: 100 }),
      tier({ minAmount: 150, maxAmount: null }),
    ]);
    expect(errs.join(' ')).toMatch(/gap/i);
  });

  it('requires the last tier to be unbounded', () => {
    expect(validateTiers([tier({ minAmount: 1, maxAmount: 100 })]).join(' ')).toMatch(/unbounded/);
  });

  it('rejects an unbounded tier that is not last, negative fees and max < min', () => {
    expect(
      validateTiers([tier({ maxAmount: null }), tier({ minAmount: 2, maxAmount: null })]).join(' '),
    ).toMatch(/only the last/);
    expect(validateTiers([tier({ feeAmount: -1 })]).join(' ')).toMatch(/feeAmount/);
    expect(validateTiers([tier({ minAmount: 10, maxAmount: 5 })]).join(' ')).toMatch(/maxAmount/);
  });
});

describe('loadFeeSchedule', () => {
  it('uses the sample tiers when unset', () => {
    const s = loadFeeSchedule(undefined);
    expect(s).toMatchObject({ source: 'sample', valid: true });
    expect(s.tiers).toHaveLength(SAMPLE_FEE_TIERS.length);
  });

  it('uses a valid env override', () => {
    const s = loadFeeSchedule(
      JSON.stringify([
        { label: 'All', minAmount: 100, maxAmount: null, feeAmount: 3, enabled: true },
      ]),
    );
    expect(s).toMatchObject({ source: 'env', valid: true });
    expect(calculateFee(100, s.tiers).feeAmount).toBe(3);
  });

  it('reports (never silently uses) malformed or invalid overrides', () => {
    expect(loadFeeSchedule('not json')).toMatchObject({ valid: false, tiers: [] });
    expect(loadFeeSchedule('{}')).toMatchObject({ valid: false });
    const gap = loadFeeSchedule(
      JSON.stringify([
        { label: 'a', minAmount: 1, maxAmount: 10, feeAmount: 1, enabled: true },
        { label: 'b', minAmount: 20, maxAmount: null, feeAmount: 1, enabled: true },
      ]),
    );
    expect(gap.valid).toBe(false);
    expect(gap.tiers).toEqual([]);
  });
});
