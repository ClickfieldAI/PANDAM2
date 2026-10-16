/**
 * PANDAM design tokens — the single source of truth for the visual language.
 *
 * Consumed here by the UI primitives (imperative styles) and by the app's
 * Tailwind config (`apps/app/tailwind.config.js`) so NativeWind utility classes
 * and RN `StyleSheet` values never drift. Light theme only for now.
 *
 * ---------------------------------------------------------------------------
 * ART DIRECTION
 *
 * Swiss editorial design + neo-brutalism: off-white ground, near-black ink,
 * vivid orange as the one confident brand signal. Structure comes from thin
 * black borders and a strict grid, not from shadows or gradients — colour is
 * reserved for MEANING:
 *
 *   orange (`accent*`)   primary brand — "I HAVE", the main action
 *   ink (`need*`)        "I NEED"      — deliberately stays black/white, not
 *                         a second brand colour, so orange keeps reading as
 *                         special rather than "the app's palette"
 *   orange (`match*`)    RECIPROCAL    — the one moment allowed to feel loud
 *
 * Roughly 70–80% off-white/white, 15–20% black/charcoal, 5–10% orange. If
 * every button is orange, none of them are.
 * ---------------------------------------------------------------------------
 */

/* -------------------------------------------------------------------------- */
/* Raw ramps                                                                  */
/* -------------------------------------------------------------------------- */

export const palette = {
  // Orange — primary brand, "I HAVE", primary actions, the one loud colour.
  orange50: '#FFE9E3',
  orange100: '#FFCFC2',
  orange200: '#FFB09B',
  orange400: '#FF5A3C',
  orange500: '#FF3B1F',
  orange600: '#E62F15',
  orange700: '#B82410',
  orange900: '#6E160A',

  /*
   * Neutrals. Warm off-white ground (never clinical white), near-black ink
   * (never pure #000 — a hair warmer so large black fields don't read like a
   * screen glitch), concrete grey for structural fills and texture.
   */
  ink: '#050505',
  charcoal: '#1A1A1A',
  graphite: '#333333',
  steel: '#5C5C5C',
  concrete: '#D9D7D2',
  concreteSoft: '#E8E6E1',
  line: '#050505',
  lineSoft: '#D9D7D2',
  offWhite: '#F5F3EE',
  white: '#FCFBF8',

  // Feedback. Kept out of the orange hue so they never compete with it.
  red600: '#B3261E',
  red700: '#8C1D17',
  red50: '#F7E6E4',
  yellow700: '#8A5D06',
  yellow50: '#FBF1DE',
  green700: '#2F6B3A',
  green600: '#3B8249',
  green50: '#E6F1E8',
  blue600: '#3D6E8C',
  blue50: '#E9F1F5',
} as const;

/* -------------------------------------------------------------------------- */
/* Semantic colours                                                           */
/* -------------------------------------------------------------------------- */

export const lightColors = {
  /** App background. */
  background: palette.offWhite,
  /** Secondary background — elevated section fills, alternating rows. */
  backgroundSecondary: palette.concreteSoft,
  /** Default card / sheet surface — one perceptible step above `background`. */
  surface: palette.white,
  /** Subtle filled surface (inputs at rest, chips, skeletons). */
  surfaceMuted: palette.concreteSoft,
  /** Pressed/hovered state for a surface that is interactive. */
  surfaceHover: palette.concrete,
  /** Deep surface used behind hero headers. */
  surfaceInverse: palette.ink,

  /** Structural rule. Brutalist system: the border IS the component edge. */
  border: palette.line,
  /** Even quieter divider, for rules inside an already-bordered container. */
  borderSoft: palette.lineSoft,
  /** Border on a control that has focus or is selected. */
  borderStrong: palette.ink,

  textPrimary: palette.ink,
  textSecondary: palette.graphite,
  /** Supporting copy. AA-compliant, unlike a low-contrast grey. */
  textMuted: palette.steel,
  /**
   * Deliberately below AA — only for decoration that repeats information
   * already available elsewhere (a chevron, a separator dot, a placeholder
   * glyph). Never the only carrier of meaning, never body copy.
   */
  textFaint: palette.concrete,
  textInverse: palette.white,

  /** Brand / primary action / "I HAVE". The one loud colour. */
  accent: palette.orange500,
  accentStrong: palette.orange600,
  accentBright: palette.orange400,
  accentSoft: palette.orange50,
  accentBorder: palette.orange500,
  /** Use when orange carries small text — passes AA on white. */
  accentText: palette.orange700,

  /**
   * "I NEED". Deliberately NOT a second brand colour — per the Swiss/
   * neo-brutalist direction, "I NEED" stays structural (black/white) so
   * orange keeps reading as the one special signal, not "the app's palette".
   */
  need: palette.ink,
  needStrong: palette.charcoal,
  needBright: palette.graphite,
  needSoft: palette.concreteSoft,
  needBorder: palette.ink,
  needText: palette.ink,

  /** Reciprocal barter match — the one moment allowed to feel loud. */
  match: palette.orange500,
  matchStrong: palette.orange700,
  matchBright: palette.orange400,
  matchSoft: palette.orange50,
  matchBorder: palette.orange500,
  matchText: palette.orange700,

  success: palette.green600,
  successSoft: palette.green50,
  successText: palette.green700,
  warning: palette.yellow700,
  warningSoft: palette.yellow50,
  warningText: palette.yellow700,
  danger: palette.red600,
  dangerStrong: palette.red700,
  dangerSoft: palette.red50,
  dangerText: palette.red700,
  info: palette.blue600,
  infoSoft: palette.blue50,
  infoText: palette.blue600,
  infoBorder: '#C4D8E3',
  warningBorder: '#EAD3A6',
  dangerBorder: '#E3B6B1',
  /** Deeper pressed fill for a muted control. */
  surfacePressed: palette.concrete,

  /** Keyboard focus ring. Brand colour, never the OS blue. */
  focus: palette.orange500,
  /** Scrim behind a modal or sheet. */
  scrim: 'rgba(5, 5, 5, 0.5)',
} as const;

/** Every semantic colour, as plain strings — the shape both themes share. */
export type ThemeColors = Record<keyof typeof lightColors, string>;

/**
 * Dark theme — the same application in its dark form, not a different design.
 * Near-black ground, charcoal surfaces, light text, subtle dark-grey rules;
 * the orange accent is unchanged. `need`/`surfaceInverse` (white-text fills
 * in light mode) become lifted charcoal so they stay visible on the ground.
 */
export const darkColors: ThemeColors = {
  background: '#0F0F10',
  backgroundSecondary: '#18181A',
  surface: '#1B1B1E',
  surfaceMuted: '#252528',
  surfaceHover: '#2E2E32',
  surfaceInverse: '#2A2A2E',

  border: '#3A3A40',
  borderSoft: '#2A2A2E',
  borderStrong: '#F5F3EE',

  textPrimary: '#F5F3EE',
  textSecondary: '#D4D2CC',
  textMuted: '#A7A5A0',
  textFaint: '#5A5A60',
  textInverse: '#FCFBF8',

  accent: palette.orange500,
  accentStrong: palette.orange600,
  accentBright: palette.orange400,
  accentSoft: '#3A1D15',
  accentBorder: palette.orange500,
  accentText: '#FF8C72',

  need: '#2F2F34',
  needStrong: '#3A3A40',
  needBright: '#46464D',
  needSoft: '#252528',
  needBorder: '#4A4A52',
  needText: '#F5F3EE',

  match: palette.orange500,
  matchStrong: '#FF6A4D',
  matchBright: palette.orange400,
  matchSoft: '#3A1D15',
  matchBorder: palette.orange500,
  matchText: '#FF8C72',

  success: '#4CA85C',
  successSoft: '#15281A',
  successText: '#7BCB8A',
  warning: '#D69A2D',
  warningSoft: '#2F2410',
  warningText: '#E8B455',
  danger: '#E5584E',
  dangerStrong: '#C9423A',
  dangerSoft: '#341A18',
  dangerText: '#FF8F86',
  info: '#5C95B5',
  infoSoft: '#16252E',
  infoText: '#86B8D4',
  infoBorder: '#2C4452',
  warningBorder: '#52411F',
  dangerBorder: '#5A2B27',
  surfacePressed: '#2E2E32',

  focus: palette.orange500,
  scrim: 'rgba(0, 0, 0, 0.65)',
};

/**
 * The LIGHT theme, as a plain value. Components must not read this directly —
 * they call `useThemeColors()` so they re-render when the theme changes. It
 * stays exported for the Tailwind config and non-React callers only.
 */
export const colors: ThemeColors = lightColors;

/* -------------------------------------------------------------------------- */
/* Gradients                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Two-stop gradients, `readonly [from, to]`, consumed by `<Gradient>`.
 *
 * Reserved, not decorative — a flat brutalist system wants almost no
 * gradients at all. `hero`/`ink` are dark ink panels (a near-flat gradient
 * just to avoid a dead-flat black field); `match` is the one place allowed a
 * hint of glow. The `cover*` set is the fallback when an item has no
 * photograph — desaturated concrete/charcoal tones so a wall of imageless
 * cards reads as industrial material, not a colour-swatch page.
 */
export const gradients = {
  match: [palette.orange400, palette.orange700],
  hero: [palette.charcoal, palette.ink],
  ink: [palette.graphite, palette.ink],
  cover1: ['#8A8A86', '#3A3A38'],
  cover2: ['#9C9690', '#4A4542'],
  cover3: ['#86888A', '#38393A'],
  cover4: ['#8E8A80', '#403C36'],
  cover5: ['#94908C', '#424040'],
  cover6: ['#84827E', '#363432'],
} as const;

export type GradientToken = keyof typeof gradients;

/** Stable gradient pick for a string (category id, item id, name). */
const COVER_KEYS = ['cover1', 'cover2', 'cover3', 'cover4', 'cover5', 'cover6'] as const;

export function coverFor(seed: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const key = COVER_KEYS[h % COVER_KEYS.length] ?? 'cover1';
  return gradients[key];
}

/* -------------------------------------------------------------------------- */
/* Space, radius, type                                                        */
/* -------------------------------------------------------------------------- */

/** Space scale (dp). A 4-based rhythm; everything in the product is one of these. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
  '6xl': 72,
} as const;

/**
 * Radius. Neo-brutalist: sharp by default. Controls are nearly square (4),
 * containers get a small radius (8) just enough to not look like a browser
 * `<div>`, and the full pill is reserved for things that are genuinely
 * pill-shaped — filter chips, tags, status labels. Buttons are NOT pills in
 * this system; see `Button.tsx`.
 */
export const radii = {
  none: 0,
  /** Inline marks: small swatches. */
  xs: 2,
  /** Badges, inline tags. */
  sm: 4,
  /** Controls: buttons, inputs, segmented controls. */
  md: 4,
  /** Containers: cards, sheets, tiles. */
  lg: 8,
  /** Hard cap — nothing in this system rounds past 8px except the pill. */
  xl: 8,
  '2xl': 8,
  pill: 999,
} as const;

/**
 * Type scale — Swiss editorial: a handful of sizes used with intent, large
 * display sizes allowed to dominate a screen. Negative tracking scales with
 * size, which is what keeps big type from reading as a browser default
 * heading. `fontFamily` pins exact weight files (Inter Tight / Inter, loaded
 * in `apps/app/app/_layout.tsx`) — custom fonts on RN need an exact family
 * per weight, numeric `fontWeight` alone does not reliably apply.
 */
export const typography = {
  /** The oversized editorial headline — "WHAT DO / YOU HAVE?". */
  hero: {
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '800' as const,
    letterSpacing: -1.3,
    fontFamily: 'InterTight_800ExtraBold',
  },
  display: {
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '800' as const,
    letterSpacing: -0.9,
    fontFamily: 'InterTight_800ExtraBold',
  },
  h1: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    fontFamily: 'InterTight_700Bold',
  },
  h2: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    fontFamily: 'InterTight_700Bold',
  },
  h3: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    fontFamily: 'InterTight_600SemiBold',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: -0.05,
    fontFamily: 'Inter_400Regular',
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.08,
    fontFamily: 'Inter_600SemiBold',
  },
  bodySm: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '400' as const,
    letterSpacing: 0,
    fontFamily: 'Inter_400Regular',
  },
  /** Form labels, inline actions, chip text. */
  label: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600' as const,
    letterSpacing: 0,
    fontFamily: 'Inter_600SemiBold',
  },
  /** Metadata, helper text, timestamps. */
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    letterSpacing: 0,
    fontFamily: 'Inter_400Regular',
  },
  /**
   * All-caps eyebrow / section number ("01 — SOMETHING I HAVE"). Wide
   * tracking because bold caps at this size are unreadable without it — this
   * is the single most load-bearing text style in the whole redesign.
   */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    fontFamily: 'InterTight_700Bold',
  },
  /**
   * Money and counts. Pair with `<Text numeric>`, which adds tabular figures
   * so a column of numbers does not jitter as digits change.
   */
  numeric: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
    fontFamily: 'InterTight_700Bold',
  },
  numericLarge: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    fontFamily: 'InterTight_800ExtraBold',
  },
} as const;

export type TypographyVariant = keyof typeof typography;

/* -------------------------------------------------------------------------- */
/* Elevation & motion                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Elevation presets — deliberately minimal. Structure comes from the 1–2px
 * black border, not a shadow; a shadow here only says "this is genuinely
 * floating above the page" (a sheet, a sticky bar), and even then it stays
 * tight and nearly flat rather than soft and diffuse — a soft blurred shadow
 * reads as Material/iOS-default, which is exactly what this system avoids.
 */
export const shadows = {
  none: {},
  /** Barely there. A card that should feel attached to the page. */
  xs: {
    shadowColor: palette.ink,
    shadowOpacity: 0.08,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  /** A resting card — tight, hard-edged, almost no blur. */
  sm: {
    shadowColor: palette.ink,
    shadowOpacity: 0.14,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** A lifted card — hovered, held, or a hero tile. */
  md: {
    shadowColor: palette.ink,
    shadowOpacity: 0.18,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 4 },
    elevation: 6,
  },
  /** Modals, sheets, floating objects. */
  lg: {
    shadowColor: palette.ink,
    shadowOpacity: 0.22,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 6 },
    elevation: 10,
  },
} as const;

/**
 * Coloured glow. Kept for the reciprocal-match surface only — the one place
 * this system allows a hint of spectacle.
 */
export function glow(color: string, opacity = 0.22) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  } as const;
}

/**
 * Focus ring for keyboard navigation. Brand orange plus a white gap, so it
 * stays visible on both light surfaces and the black structural elements.
 */
export const focusRing = {
  outlineStyle: 'solid',
  outlineWidth: 2,
  outlineColor: colors.focus,
  outlineOffset: 2,
} as const;

/**
 * Durations (ms). Interface motion should be quick enough to feel like
 * response rather than animation: nothing in the product exceeds 240ms.
 */
export const timings = { instant: 90, fast: 140, base: 200, slow: 240 } as const;

/** Spring presets for `Animated.spring` press feedback. */
export const springs = {
  press: { damping: 22, stiffness: 380, mass: 0.5 },
  enter: { damping: 24, stiffness: 200, mass: 0.8 },
  /** Soft settle for tilt/depth returning to rest. */
  tilt: { damping: 16, stiffness: 160, mass: 0.7 },
  /**
   * Sheets/drawers — per the `apple-design` skill's own table ("Drawer /
   * sheet: damping ~0.8"), a touch under-damped rather than critically
   * damped: this is a gesture-driven surface, so a slight settle-bounce is
   * expected once real drag velocity is handed off to it (see
   * `Sheet.tsx`), not decoration bolted on afterwards.
   */
  sheet: { damping: 20, stiffness: 300, mass: 0.9 },
} as const;

/**
 * Ambient motion (ms). The ONE exception to the 240ms ceiling: slow idle loops
 * on decorative objects (empty states, the match moment). Never on controls,
 * and always disabled under reduced motion.
 */
export const ambient = { float: 3200, drift: 5200, pulse: 1800 } as const;

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export const layout = {
  /** Max content width on web so the layout is not "mobile UI, but wider". */
  contentMaxWidth: 720,
  /** Reading measure for long prose — narrower than the content column. */
  proseMaxWidth: 560,
  /** Minimum tap target. Anything interactive must reach this, via hitSlop if small. */
  touchTarget: 44,
  /** Horizontal page gutter. */
  gutter: spacing.xl,
  /** Tighter gutter for dense rows inside an already-padded container. */
  gutterTight: spacing.lg,
  /**
   * Bottom padding on every tab screen. The tab bar sits ABOVE the content
   * (see apps/app/src/components/nav/PandamTabBar.tsx), so the last item
   * needs this much room to scroll clear of it.
   */
  tabBarInset: 128,
  /** Hairline structural border — the default border width everywhere. */
  hairline: 1,
  /** Heavier structural border, for the elements that should anchor a screen. */
  borderThick: 2,
} as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;

export const tokens = {
  palette,
  colors,
  gradients,
  spacing,
  radii,
  typography,
  shadows,
  focusRing,
  timings,
  springs,
  ambient,
  layout,
} as const;
