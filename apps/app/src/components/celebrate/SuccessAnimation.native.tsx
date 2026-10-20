import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';

import { useMotionOK, useThemeColors } from '@pandam/ui';

import type { SuccessAnimationProps } from './SuccessAnimation';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset import
const source = require('../../../assets/lottie/success.json');

/**
 * The "it worked" check, played once. Under the OS "reduce motion" setting it
 * is a still check instead — same meaning, no movement. The stroke colour
 * follows the theme (the artwork's own green is only a default).
 */
export function SuccessAnimation({ size = 96, onFinish }: SuccessAnimationProps) {
  const colors = useThemeColors();
  const motionOK = useMotionOK();

  if (!motionOK) return <Ionicons name="checkmark-circle" size={size} color={colors.success} />;
  return (
    <LottieView
      source={source}
      autoPlay
      loop={false}
      style={{ width: size, height: size }}
      colorFilters={[
        { keypath: 'ring', color: colors.success },
        { keypath: 'check', color: colors.success },
      ]}
      onAnimationFinish={(cancelled) => {
        if (!cancelled) onFinish?.();
      }}
    />
  );
}
