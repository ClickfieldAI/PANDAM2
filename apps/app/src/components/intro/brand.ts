/** Sizes and colours of the supplied brand artwork. No image imports: safe to use in tests. */
export const BRAND = {
  /** Average colour of the paper tile: shown instantly, before the grain image has loaded. */
  paper: '#F3F0E7',
  pSymbol: { width: 521, height: 444 },
  logo: { width: 1748, height: 541 },
  /**
   * Where the P sits INSIDE the logo image, in the logo's own pixels. The standalone P
   * (`p-symbol.png`) is cut from the logo itself, so it lands on this rectangle pixel for pixel.
   */
  pInLogo: { x: 3, y: 0, width: 521, height: 444 },
  cornerTL: { width: 620, height: 480 },
  cornerTR: { width: 308, height: 500 },
  cornerBL: { width: 700, height: 463 },
  cornerBR: { width: 328, height: 403 },
} as const;
