import { createContext, type ReactNode, type Ref, useContext } from 'react';
import { RefreshControl, ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '../theme';
import { layout, palette, spacing } from '../tokens';

/**
 * App-wide default backdrop. The app provides one (its ambient background) at
 * the root; every Screen on the standard page background paints it unless it
 * passes its own `backdrop` (or `backdrop={null}` to opt out).
 */
const DefaultBackdrop = createContext<ReactNode>(null);
export const ScreenBackdropProvider = DefaultBackdrop.Provider;

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Horizontal + vertical content padding. */
  padded?: boolean;
  edges?: readonly Edge[];
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Sticky footer (e.g. a primary CTA) rendered outside the scroll area. */
  footer?: ReactNode;
  /** Reserve bottom space for the floating tab bar. */
  tabBarInset?: boolean;
  /** Page background; `inverse` for hero screens that paint their own header. */
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Decorative layer painted full-bleed behind the content (ambient shapes).
   * Must be non-interactive; it never affects layout.
   */
  backdrop?: ReactNode;
  /** Ref to the scroll view (when `scroll`), so callers can scroll content into view. */
  scrollRef?: Ref<ScrollView>;
}

/**
 * The page wrapper every screen uses. Applies the safe-area, an optional
 * scroll view, and — crucially on web — a centred max-width column so the
 * layout is not "the mobile UI, but stretched".
 *
 * The sticky `footer` is where a screen's committing action lives. It is
 * separated from the content by a hairline and the faintest upward shadow,
 * which is the honest amount: a heavy drop shadow on a bottom bar casts light
 * from below, which nothing in the physical world does and the eye notices.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  onRefresh,
  refreshing = false,
  footer,
  tabBarInset = false,
  background: backgroundProp,
  contentStyle,
  backdrop,
  scrollRef,
}: ScreenProps) {
  const colors = useThemeColors();
  const background = backgroundProp ?? colors.background;

  const fallback = useContext(DefaultBackdrop);
  const layer =
    backdrop !== undefined ? backdrop : background === colors.background ? fallback : null;
  const inner: StyleProp<ViewStyle> = [
    { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexGrow: 1 },
    padded && { paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
    tabBarInset && { paddingBottom: layout.tabBarInset },
    contentStyle,
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={edges}>
      {layer}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'stretch' }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            ) : undefined
          }
        >
          <View style={inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}

      {footer ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: spacing.md,
            paddingBottom: spacing.lg,
            shadowColor: palette.ink,
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          }}
        >
          <View style={{ width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' }}>
            {footer}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
