/** Sizes and colours of the supplied brand artwork. No image imports: safe to use in tests. */
export const BRAND = {
  /** Average colour of the paper tile: shown instantly, before the grain image has loaded. */
  paper: '#F3F0E7',
  pSymbol: { width: 1078, height: 961 },
  logo: { width: 1695, height: 391 },
  /**
   * Where the P sits INSIDE the logo image, in the logo's own pixels. Found by fitting the
   * standalone P onto the logo's P (best overlap of the two silhouettes, ~92%): the two are the
   * same artwork, but the logo's P is drawn slightly taller, so the travelling P is stretched
   * a little (about 6%) on arrival to land exactly on it.
   */
  pInLogo: { x: 4, y: -8, width: 405, height: 384 },
  cornerTL: { width: 620, height: 480 },
  cornerTR: { width: 308, height: 500 },
  cornerBL: { width: 700, height: 463 },
  cornerBR: { width: 328, height: 403 },
} as const;
