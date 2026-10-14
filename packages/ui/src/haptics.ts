import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Tactile feedback, tiered by how much the action matters. Every call is
 * fire-and-forget and swallows failures: a device without a haptic engine,
 * a platform without the API (web) or an OS-level "vibration off" setting
 * must never surface as an error or block the action that triggered it.
 */
function run(fn: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    void fn().catch(() => undefined);
  } catch {
    // Native module missing in this runtime — no feedback, no crash.
  }
}

export const haptic = {
  /** A confirmed tap on an ordinary control. */
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Choosing between options: tab, chip, segment, switch. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** An operation that really completed. Call only from a success path. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** An operation that really failed. Never for ordinary navigation. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Just before a consequential or destructive confirmation. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};

export type HapticKind = 'light' | 'selection' | 'none';
