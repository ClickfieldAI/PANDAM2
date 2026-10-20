/**
 * The maths of the two-screen intro, kept free of React so it can be unit-tested.
 *
 * Everything is derived from the MEASURED stage size and safe-area insets, plus the artwork's
 * own proportions: no device-specific numbers. The functions carry the 'worklet' directive so
 * the animation can call them on the UI thread; in tests they are ordinary functions.
 */
import { BRAND } from './brand';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IntroLayout {
  /** Where the standalone P sits on screen 1. */
  p1: Rect;
  /** The complete logo on screen 2. */
  logo: Rect;
  /** Where the logo's OWN P is, in screen coordinates: the travelling P lands exactly here. */
  p2: Rect;
  /** One scale shared by the four corner shapes. */
  cornerScale: number;
}

export function introLayout(
  width: number,
  height: number,
  insetTop: number,
  insetBottom: number,
): IntroLayout {
  // The centre of the usable area (inside the safe-area insets).
  const cx = width / 2;
  const cy = insetTop + (height - insetTop - insetBottom) / 2;

  const p1w = Math.min(width * 0.46, 300);
  const p1h = p1w * (BRAND.pSymbol.height / BRAND.pSymbol.width);

  const lw = Math.min(width * 0.84, 620);
  const lh = lw * (BRAND.logo.height / BRAND.logo.width);
  const lx = cx - lw / 2;
  const ly = cy - lh / 2;
  const k = lw / BRAND.logo.width;

  return {
    p1: { x: cx - p1w / 2, y: cy - p1h / 2, width: p1w, height: p1h },
    logo: { x: lx, y: ly, width: lw, height: lh },
    p2: {
      x: lx + BRAND.pInLogo.x * k,
      y: ly + BRAND.pInLogo.y * k,
      width: BRAND.pInLogo.width * k,
      height: BRAND.pInLogo.height * k,
    },
    cornerScale: Math.min(width / 1028, height / 1000),
  };
}

/* ----- tiny helpers --------------------------------------------------------------------- */
export const clamp01 = (v: number) => {
  'worklet';
  return v < 0 ? 0 : v > 1 ? 1 : v;
};
/** 0 before a, 1 after b, linear between. */
export const seg = (p: number, a: number, b: number) => {
  'worklet';
  return clamp01((p - a) / (b - a));
};
/** Gentle ease in and out. */
export const ease = (t: number) => {
  'worklet';
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

/** Progress from the raw scroll offset: 0 = screen 1, 1 = screen 2. Without motion: swap at 0.5. */
export const progressOf = (offset: number, width: number, motion: boolean) => {
  'worklet';
  const raw = clamp01(offset / width);
  return motion ? raw : raw < 0.5 ? 0 : 1;
};

/** When each layer plays, as fractions of the swipe. */
export const TIMELINE = {
  /** The P travels and resizes. */
  travel: [0, 0.86],
  /** Wordmark and tagline are revealed outward from the P. */
  reveal: [0.28, 0.94],
  revealFade: [0.3, 0.9],
  /** The corner shapes slide in. */
  corners: [0.12, 0.95],
  /** Hand-over: the intact logo fades in exactly as the travelling P fades out. */
  handover: [0.9, 1],
} as const;

export interface Frame {
  /** The travelling P (the only P drawn until the hand-over). */
  p: Rect & { opacity: number };
  /** The wordmark + tagline layer (the logo WITHOUT its P). */
  wordmark: { width: number; opacity: number };
  /** The complete, intact logo. */
  logoOpacity: number;
  /** 0 → 1: how far the corner shapes have arrived. */
  corners: number;
}

export function frameAt(progress: number, L: IntroLayout): Frame {
  'worklet';
  const t = ease(seg(progress, 0, 0.86));
  const handover = seg(progress, 0.9, 1);
  return {
    p: {
      x: lerp(L.p1.x, L.p2.x, t),
      y: lerp(L.p1.y, L.p2.y, t),
      width: lerp(L.p1.width, L.p2.width, t),
      height: lerp(L.p1.height, L.p2.height, t),
      opacity: 1 - handover,
    },
    wordmark: {
      width: L.logo.width * ease(seg(progress, 0.28, 0.94)),
      opacity: ease(seg(progress, 0.3, 0.9)) * (1 - seg(progress, 0.92, 1)),
    },
    logoOpacity: handover,
    corners: ease(seg(progress, 0.12, 0.95)),
  };
}
