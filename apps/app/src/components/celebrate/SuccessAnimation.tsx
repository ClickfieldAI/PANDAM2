import { Ionicons } from '@expo/vector-icons';

import { useThemeColors } from '@pandam/ui';

export interface SuccessAnimationProps {
  size?: number;
  onFinish?: () => void;
}

/**
 * Web build: a still checkmark. The Lottie runtime is native-only here (its
 * web build needs a separate player package we deliberately do not ship), so
 * `SuccessAnimation.native.tsx` carries the animation and this file is what
 * the browser gets.
 */
export function SuccessAnimation({ size = 96 }: SuccessAnimationProps) {
  const colors = useThemeColors();
  return <Ionicons name="checkmark-circle" size={size} color={colors.success} />;
}
