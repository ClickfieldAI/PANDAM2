import { describe, expect, it } from 'vitest';

import { dayLabel, formatMoney, statusBadgeKind, timeAgo } from '../src/lib/format';

const NOW = new Date('2026-06-15T12:00:00').getTime();
const ago = (ms: number) => NOW - ms;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it('walks up the units and never goes negative', () => {
    expect(timeAgo(ago(10_000), NOW)).toBe('just now');
    expect(timeAgo(NOW + 5 * MIN, NOW)).toBe('just now'); // clock skew: a "future" time
    expect(timeAgo(ago(5 * MIN), NOW)).toBe('5m ago');
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(timeAgo(ago(2 * DAY), NOW)).toBe('2d ago');
    expect(timeAgo(ago(14 * DAY), NOW)).toBe('2w ago');
  });
  it('falls back to a date after a month', () => {
    expect(timeAgo(ago(90 * DAY), NOW)).not.toMatch(/ago$/);
  });
});

describe('formatMoney', () => {
  it('treats the amount as paise and drops empty decimals', () => {
    expect(formatMoney(150_000)).toContain('1,500');
    expect(formatMoney(150_000)).not.toContain('.00');
    expect(formatMoney(150_050)).toContain('1,500.50');
  });
  it('survives an unknown currency code', () => {
    expect(formatMoney(1000, 'NOT_A_CODE')).toMatch(/10\.00/);
  });
});

describe('dayLabel', () => {
  it('labels today and yesterday, dates otherwise', () => {
    expect(dayLabel(NOW - HOUR, NOW)).toBe('Today');
    expect(dayLabel(NOW - DAY, NOW)).toBe('Yesterday');
    expect(dayLabel(NOW - 5 * DAY, NOW)).not.toMatch(/Today|Yesterday/);
  });
});

describe('statusBadgeKind', () => {
  it('marks only active as success and paused as warning', () => {
    expect(statusBadgeKind('published')).toBe('success');
    expect(statusBadgeKind('paused')).toBe('warning');
    expect(statusBadgeKind('archived')).toBe('neutral');
  });
});
