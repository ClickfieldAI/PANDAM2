/**
 * The client's supplied brand artwork (apps/app/assets/splash). Sizes are the files' own pixel
 * sizes, so layout code keeps their exact proportions.
 *
 *  - `p-symbol`      the standalone P (screen 1), cut from the logo itself so it lands on the logo's P exactly.
 *  - `logo`          the complete official logo: P, "ANDAM", "MAATRAM", tagline. Margin trimmed only.
 *  - `logo-wordmark` the same logo with the P removed, so the P that travels in from screen 1
 *                    can be the only visible P while the rest is revealed.
 *  - `corner-*`      the orange/black halftone shapes, cut from the supplied background with
 *                    the paper colour made transparent.
 *  - `paper`         a tile of the supplied background's paper grain, used on BOTH screens.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro asset imports */
export const brandAssets = {
  pSymbol: require('../../../assets/splash/p-symbol.png'),
  logo: require('../../../assets/splash/logo.png'),
  wordmark: require('../../../assets/splash/logo-wordmark.png'),
  paper: require('../../../assets/splash/paper.png'),
  cornerTL: require('../../../assets/splash/corner-tl.png'),
  cornerTR: require('../../../assets/splash/corner-tr.png'),
  cornerBL: require('../../../assets/splash/corner-bl.png'),
  cornerBR: require('../../../assets/splash/corner-br.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */
