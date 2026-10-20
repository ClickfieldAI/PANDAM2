import { describe, expect, it } from 'vitest';

import { BRAND } from '../src/components/intro/brand';
import { frameAt, introLayout, progressOf, type Rect } from '../src/components/intro/geometry';

/** Phones and a tablet, with and without notches / home indicators. */
const SCREENS: { name: string; w: number; h: number; top: number; bottom: number }[] = [
  { name: 'small phone 320x568', w: 320, h: 568, top: 20, bottom: 0 },
  { name: 'iPhone 14 390x844', w: 390, h: 844, top: 47, bottom: 34 },
  { name: 'big phone 430x932', w: 430, h: 932, top: 59, bottom: 34 },
  { name: 'tall Android 360x800', w: 360, h: 800, top: 28, bottom: 16 },
  { name: 'tablet 768x1024', w: 768, h: 1024, top: 24, bottom: 20 },
  { name: 'landscape phone 844x390', w: 844, h: 390, top: 0, bottom: 21 },
];

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);

describe.each(SCREENS)('intro on $name', ({ w, h, top, bottom }) => {
  const L = introLayout(w, h, top, bottom);

  it('screen 1: the P alone, centred in the safe area, nothing else visible', () => {
    const f = frameAt(0, L);
    const c = centre(f.p);
    expect(c.x).toBeCloseTo(w / 2, 5);
    expect(c.y).toBeCloseTo(top + (h - top - bottom) / 2, 5);
    expect(f.p.opacity).toBe(1);
    expect(f.logoOpacity).toBe(0);
    expect(f.wordmark.opacity).toBe(0);
    expect(f.corners).toBe(0);
    // Same proportions as the supplied P image.
    expect(f.p.width / f.p.height).toBeCloseTo(BRAND.pSymbol.width / BRAND.pSymbol.height, 5);
  });

  it("screen 2: the travelling P has landed exactly on the logo's own P, then the intact logo takes over", () => {
    const f = frameAt(1, L);
    expect(f.p.x).toBeCloseTo(L.p2.x, 5);
    expect(f.p.y).toBeCloseTo(L.p2.y, 5);
    expect(f.p.width).toBeCloseTo(L.p2.width, 5);
    expect(f.p.height).toBeCloseTo(L.p2.height, 5);
    expect(f.p.opacity).toBe(0);
    expect(f.logoOpacity).toBe(1);
    expect(f.wordmark.opacity).toBe(0); // the intact logo alone, no double-drawn lettering
    expect(f.corners).toBe(1);
    // The complete logo is centred and keeps its proportions.
    expect(centre(L.logo).x).toBeCloseTo(w / 2, 5);
    expect(L.logo.width / L.logo.height).toBeCloseTo(BRAND.logo.width / BRAND.logo.height, 5);
    expect(L.logo.x).toBeGreaterThanOrEqual(0);
    expect(L.logo.x + L.logo.width).toBeLessThanOrEqual(w);
  });

  it('there is exactly one visible P at every point of the swipe', () => {
    for (const p of STEPS) {
      const f = frameAt(p, L);
      // The travelling P and the P inside the intact logo: their opacities always add up to 1,
      // so the viewer sees one P — never none, never two.
      expect(f.p.opacity + f.logoOpacity, `p=${p}`).toBeCloseTo(1, 6);
      // The wordmark layer contains no P at all.
      expect(f.wordmark.opacity).toBeGreaterThanOrEqual(0);
      expect(f.wordmark.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('while the intact logo is not yet visible, the P is the only P; when both show they coincide', () => {
    for (const p of STEPS) {
      const f = frameAt(p, L);
      if (f.logoOpacity === 0) continue; // only the travelling P
      // Hand-over: the travelling P must already sit on the logo's P.
      expect(f.p.x).toBeCloseTo(L.p2.x, 3);
      expect(f.p.y).toBeCloseTo(L.p2.y, 3);
      expect(f.p.width).toBeCloseTo(L.p2.width, 3);
      expect(f.p.height).toBeCloseTo(L.p2.height, 3);
    }
  });

  it('moves smoothly: no jump larger than a few pixels between neighbouring steps', () => {
    let prev = frameAt(0, L);
    for (const p of STEPS.slice(1)) {
      const f = frameAt(p, L);
      const span = Math.hypot(L.p1.x - L.p2.x, L.p1.y - L.p2.y, L.p1.width - L.p2.width) || 1;
      expect(Math.abs(f.p.x - prev.p.x)).toBeLessThan(span * 0.04);
      expect(Math.abs(f.p.y - prev.p.y)).toBeLessThan(span * 0.04);
      expect(Math.abs(f.p.width - prev.p.width)).toBeLessThan(span * 0.04);
      expect(Math.abs(f.p.opacity - prev.p.opacity)).toBeLessThan(0.1);
      expect(Math.abs(f.logoOpacity - prev.logoOpacity)).toBeLessThan(0.1);
      prev = f;
    }
  });

  it('is monotonic, so swiping back plays exactly the same frames in reverse', () => {
    let prev = frameAt(0, L);
    for (const p of STEPS.slice(1)) {
      const f = frameAt(p, L);
      expect(f.corners).toBeGreaterThanOrEqual(prev.corners - 1e-9);
      expect(f.wordmark.width).toBeGreaterThanOrEqual(prev.wordmark.width - 1e-9);
      expect(f.p.opacity).toBeLessThanOrEqual(prev.p.opacity + 1e-9);
      expect(f.logoOpacity).toBeGreaterThanOrEqual(prev.logoOpacity - 1e-9);
      prev = f;
    }
    // Same input, same frame: the function has no memory.
    expect(frameAt(0.37, L)).toEqual(frameAt(0.37, L));
  });

  it('keeps the travelling P inside the screen the whole way', () => {
    for (const p of STEPS) {
      const f = frameAt(p, L);
      expect(f.p.x).toBeGreaterThanOrEqual(-1);
      expect(f.p.x + f.p.width).toBeLessThanOrEqual(w + 1);
      expect(f.p.y + f.p.height).toBeLessThanOrEqual(h + 1);
    }
  });

  it('the wordmark is revealed outward from the P, never wider than the logo', () => {
    for (const p of STEPS) {
      const f = frameAt(p, L);
      expect(f.wordmark.width).toBeGreaterThanOrEqual(0);
      expect(f.wordmark.width).toBeLessThanOrEqual(L.logo.width + 1e-9);
    }
  });
});

describe('reduced motion', () => {
  it('has no in-between frames: the screens simply swap', () => {
    const L = introLayout(390, 844, 47, 34);
    for (const offset of [0, 40, 120, 190, 195, 260, 390]) {
      const p = progressOf(offset, 390, false);
      expect([0, 1]).toContain(p);
      const f = frameAt(p, L);
      expect(f.p.opacity + f.logoOpacity).toBeCloseTo(1, 6);
    }
    expect(progressOf(100, 390, false)).toBe(0);
    expect(progressOf(200, 390, false)).toBe(1);
  });

  it('with motion on, progress follows the finger', () => {
    expect(progressOf(0, 390, true)).toBe(0);
    expect(progressOf(195, 390, true)).toBeCloseTo(0.5, 6);
    expect(progressOf(390, 390, true)).toBe(1);
    expect(progressOf(-30, 390, true)).toBe(0); // iOS rubber band
    expect(progressOf(500, 390, true)).toBe(1);
  });
});
