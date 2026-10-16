import { type ReactNode } from 'react';
import { View } from 'react-native';

import { useThemeColors } from '../theme';
import { radii, spacing } from '../tokens';
import { type ThemeColors } from '../tokens';

import { Text } from './Text';

export type NoticeKind = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface NoticeProps {
  /** The message. Should say what happened AND what to do about it. */
  children: ReactNode;
  kind?: NoticeKind;
  /** Optional bold first line, for a notice that needs a headline. */
  title?: string;
  /** Icon node, so the app owns its icon set. A kind-appropriate one is wise. */
  icon?: ReactNode;
  /** Trailing action, e.g. a retry link. */
  action?: ReactNode;
}

const makeSPEC = (
  colors: ThemeColors,
): Record<
  NoticeKind,
  { bg: string; border: string; tone: 'danger' | 'warning' | 'success' | 'secondary' | 'muted' }
> => ({
  info: { bg: colors.infoSoft, border: colors.infoBorder, tone: 'secondary' },
  success: { bg: colors.successSoft, border: colors.accentBorder, tone: 'success' },
  warning: { bg: colors.warningSoft, border: colors.warningBorder, tone: 'warning' },
  danger: { bg: colors.dangerSoft, border: colors.dangerBorder, tone: 'danger' },
  neutral: { bg: colors.surfaceMuted, border: colors.border, tone: 'muted' },
});

/**
 * An inline message attached to the thing it is about — a form error, a
 * safety note, a "payments are handled by Razorpay" disclaimer.
 *
 * Six screens were each building their own version of this, which is why a
 * validation failure looked different on the login screen than on the item
 * form. One component means one voice.
 *
 * The tinted background is what distinguishes a notice from ordinary copy;
 * the hairline border is what stops the tint reading as a broken text
 * highlight. Both are needed — a tint alone is too easy to miss on an
 * off-white page, and a border alone reads as an empty input.
 */
export function Notice({ children, kind = 'neutral', title, icon, action }: NoticeProps) {
  const colors = useThemeColors();

  const spec = makeSPEC(colors)[kind];

  return (
    <View
      // Announced as one unit, so a screen reader does not read the icon and
      // the message as two unrelated fragments.
      accessible
      accessibilityRole={kind === 'danger' ? 'alert' : 'text'}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        backgroundColor: spec.bg,
        borderWidth: 1,
        borderColor: spec.border,
        borderRadius: radii.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
      }}
    >
      {icon ? <View style={{ marginTop: 1 }}>{icon}</View> : null}

      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="bodySm" tone={spec.tone} style={{ fontWeight: '600' }}>
            {title}
          </Text>
        ) : null}
        <Text variant="bodySm" tone={title ? 'secondary' : spec.tone} style={{ flex: 1 }}>
          {children}
        </Text>
      </View>

      {action}
    </View>
  );
}
