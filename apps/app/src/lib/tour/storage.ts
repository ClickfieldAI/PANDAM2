/**
 * Per-account tour state, kept on the device in AsyncStorage (same mechanism
 * as `drafts.ts`). The key includes the user id so two accounts on one phone
 * never share — or leak — onboarding progress.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TourStatus = 'completed' | 'skipped';

const key = (userId: string) => `pandam.tour.v1.${userId}`;

export async function loadTourStatus(userId: string): Promise<TourStatus | null> {
  try {
    const v = await AsyncStorage.getItem(key(userId));
    return v === 'completed' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}

export async function saveTourStatus(userId: string, status: TourStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), status);
  } catch {
    // Non-fatal: worst case the tour is offered once more next launch.
  }
}
