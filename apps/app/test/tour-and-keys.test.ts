import { describe, expect, it } from 'vitest';

import { qk } from '../src/lib/query/keys';
import { TOUR_STEPS } from '../src/lib/tour/steps';

describe('tour content', () => {
  it('has complete, unique steps that point at real route groups', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0);
    const targets = TOUR_STEPS.map((s) => s.target);
    expect(new Set(targets).size).toBe(targets.length);
    for (const s of TOUR_STEPS) {
      expect(s.title.trim()).not.toBe('');
      expect(s.body.trim()).not.toBe('');
      expect(s.action.trim()).not.toBe('');
      expect(s.route).toMatch(/^\/\(app\)/);
    }
  });
});

describe('query keys', () => {
  it('are stable for equal inputs and distinct across kinds', () => {
    expect(qk.market.detail('listing', 'a')).toEqual(qk.market.detail('listing', 'a'));
    expect(qk.market.detail('listing', 'a')).not.toEqual(qk.market.detail('need', 'a'));
    expect(qk.offers.incoming()).toEqual(['offers', 'incoming', 'all']);
  });
  it('nest under their group prefix so one invalidation reaches the whole group', () => {
    expect(qk.market.discover('listing', { q: 'x' }).slice(0, 2)).toEqual(qk.market.all('listing'));
    expect(qk.offers.incoming('pending')[0]).toBe(qk.offers.all[0]);
  });
});
