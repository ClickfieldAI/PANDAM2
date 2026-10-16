/**
 * @pandam/ui — the PANDAM cross-platform design system.
 *
 * Primitives are React Native + design tokens (plus `expo-linear-gradient` for
 * the brand gradients), so they render identically on iOS, Android and web.
 * App screens compose these and may additionally use NativeWind `className`
 * for one-off layout.
 */
export * from './tokens';
export { ThemeProvider, useThemeColors, useResolvedScheme, type ResolvedScheme } from './theme';
export { cx } from './cx';
export { haptic, type HapticKind } from './haptics';

export { Text, Heading, type TextProps } from './components/Text';
export { Button, type ButtonProps } from './components/Button';
export { Sheet, type SheetProps } from './components/Sheet';
export { ScreenBackdropProvider } from './components/Screen';
export { CountBadge, type CountBadgeProps } from './components/CountBadge';
export { IconButton, type IconButtonProps } from './components/IconButton';
export { Press, type PressProps, type PressStateStyles } from './components/Press';
export { Gradient, type GradientProps } from './components/Gradient';
export { Screen, type ScreenProps } from './components/Screen';
export { Stack, Row, Divider, type StackProps, type DividerProps } from './components/layout';
export { Card, type CardProps } from './components/Card';
export { CoverTile, type CoverTileProps } from './components/CoverTile';
export { Badge, type BadgeProps } from './components/Badge';
export { Chip, type ChipProps } from './components/Chip';
export { Avatar, type AvatarProps } from './components/Avatar';
export { ListRow, IconFrame, type ListRowProps, type IconFrameProps } from './components/ListRow';
export { GroupedList, GroupedRows, type GroupedListProps } from './components/GroupedList';
export { Meta, MetaItem, type MetaProps, type MetaItemProps } from './components/Meta';
export { ToastProvider, useToast, type ToastKind, type ToastOptions } from './components/Toast';
export { Section, SectionHeader, type SectionProps } from './components/Section';
export { Rail, type RailProps } from './components/Rail';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentOption,
} from './components/SegmentedControl';
export {
  Input,
  Field,
  PasswordField,
  SearchInput,
  type InputProps,
  type FieldProps,
  type PasswordFieldProps,
  type SearchInputProps,
} from './components/Input';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export { Notice, type NoticeProps, type NoticeKind } from './components/Notice';
export {
  Skeleton,
  SkeletonCard,
  SkeletonTile,
  SkeletonText,
  SkeletonList,
  SkeletonGrid,
  type SkeletonProps,
} from './components/Skeleton';
export {
  useMotionOK,
  ALLOW_3D,
  TiltCard,
  FloatingObject,
  Reveal,
  ConnectingPair,
  project,
  rubberband,
  nearestOf2,
  type TiltCardProps,
  type FloatingObjectProps,
  type RevealProps,
  type ConnectingPairProps,
} from './motion';
