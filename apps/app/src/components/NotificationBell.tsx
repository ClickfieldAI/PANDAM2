import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { CountBadge, Press, useThemeColors } from '@pandam/ui';
import { View } from 'react-native';

import { useUnreadNotificationCount } from '@/lib/hooks/useNotifications';

/** The bell on Home. The number is the server's unread count, nothing local. */
export function NotificationBell() {
  const colors = useThemeColors();
  const router = useRouter();
  const unread = useUnreadNotificationCount();
  return (
    <Press
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => router.push('/(app)/notifications')}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: 4, right: 2 }}>
          <CountBadge
            value={unread}
            color={colors.accent}
            ringColor={colors.background}
            size={18}
          />
        </View>
      ) : null}
    </Press>
  );
}
