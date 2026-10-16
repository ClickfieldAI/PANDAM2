import { Platform, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useThemeColors } from '../theme';
import { typography, type TypographyVariant } from '../tokens';
import { type ThemeColors } from '../tokens';

type Tone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'faint'
  | 'inverse'
  | 'accent'
  | 'need'
  | 'match'
  | 'danger'
  | 'success'
  | 'warning';

/**
 * Tone colours.
 *
 * The coloured tones map to the `*Text` tokens — the darkest step in each
 * ramp — not the mid-ramp brand colours. A label in mid terracotta on white is
 * about 3.4:1, which fails AA for text; the same label in `accentText` clears
 * it and still reads unmistakably as terracotta. Fills use the bright token,
 * text uses the dark one; that distinction is why coloured copy in this
 * product stays readable.
 */
const makeTONE_COLOR = (colors: ThemeColors): Record<Tone, string> => ({
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  faint: colors.textFaint,
  inverse: colors.textInverse,
  accent: colors.accentText,
  need: colors.needText,
  match: colors.matchText,
  danger: colors.dangerText,
  success: colors.successText,
  warning: colors.warningText,
});

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: Tone;
  /** Render the string upper-cased — pairs with the `overline` variant. */
  caps?: boolean;
  /** Centre the text without a one-off style object at the call site. */
  center?: boolean;
  /**
   * Tabular figures: every digit takes the same width, so a price that ticks
   * from ₹999 to ₹1,000 does not shove the layout sideways. Use for money,
   * counts, ratings and timers.
   */
  numeric?: boolean;
}

/**
 * The typographic primitive. `variant` picks size/line-height/weight/tracking
 * from the type scale; `tone` picks a semantic colour. Everything else is a
 * normal `<Text>`.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  caps = false,
  center = false,
  numeric = false,
  style,
  children,
  ...rest
}: TextProps) {
  const colors = useThemeColors();

  return (
    <RNText
      style={[
        typography[variant],
        { color: makeTONE_COLOR(colors)[tone] },
        caps && { textTransform: 'uppercase' },
        center && { textAlign: 'center' },
        numeric && { fontVariant: ['tabular-nums'] },
        // RNW needs the CSS property as well to actually switch the figures.
        numeric && Platform.OS === 'web'
          ? ({ fontFeatureSettings: '"tnum"' } as unknown as RNTextProps['style'])
          : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

/** Convenience wrappers so screens read well. */
export const Heading = ({ variant = 'h2', ...rest }: TextProps) => (
  <Text variant={variant} {...rest} />
);
