import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Press, Text, radii, spacing, useThemeColors, useToast } from '@pandam/ui';

import { openDialer, openWhatsApp } from '@/lib/contact';
import { useContact, useConversation } from '@/lib/hooks/useConversations';

/** WhatsApp's own green: the one place a third-party brand colour is right. */
const WHATSAPP = '#128C7E';

function Action({
  label,
  icon,
  color,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
}: {
  label: string;
  icon: ReactNode;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Press
      haptic="light"
      scale="md"
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      hitSlop={6}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : icon}
      <Text variant="bodyStrong" style={{ color, fontSize: 17 }}>
        {label}
      </Text>
    </Press>
  );
}

/**
 * Message, Call and WhatsApp in one horizontal row.
 *
 * Message is always there. Call and WhatsApp appear only once the server says this trade is
 * accepted and live (`canContact`); the other person's number is then fetched on its own request,
 * which the server answers only for the people in the trade. If that request is refused (the trade
 * was cancelled in the meantime) the two buttons simply disappear again.
 *
 * Neither button sends anything: Call opens the phone's dialer with the number filled in, and
 * WhatsApp opens the chat; the person still decides to dial or to write.
 */
export function ContactActions({
  conversationId,
  canContact,
  onMessage,
}: {
  conversationId: string;
  canContact: boolean;
  /** Message: bring up the composer in this conversation. */
  onMessage: () => void;
}) {
  const colors = useThemeColors();
  const toast = useToast();
  const contact = useContact(conversationId, canContact);

  const showPhoneActions = canContact && !contact.isError;
  const phone = contact.data?.phone ?? null;
  const loading = canContact && contact.isPending;
  const missing = canContact && contact.isSuccess && !phone;

  const run = async (open: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await open();
    if (!result.ok && result.message) toast.error(result.message);
  };

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radii.lg,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.xs,
        }}
      >
        <Action
          label="Message"
          color={colors.textSecondary}
          icon={<Ionicons name="chatbubble-outline" size={24} color={colors.textSecondary} />}
          onPress={onMessage}
          accessibilityLabel="Message"
        />
        {showPhoneActions ? (
          <>
            <Action
              label="Call"
              color={colors.textSecondary}
              icon={<Ionicons name="call-outline" size={24} color={colors.textSecondary} />}
              loading={loading}
              disabled={missing}
              onPress={() => void run(() => openDialer(phone))}
              accessibilityLabel="Call. Opens your phone's dialer with their number."
            />
            <Action
              label="WhatsApp"
              color={WHATSAPP}
              icon={<Ionicons name="logo-whatsapp" size={24} color={WHATSAPP} />}
              loading={loading}
              disabled={missing}
              onPress={() => void run(() => openWhatsApp(phone))}
              accessibilityLabel="WhatsApp. Opens a WhatsApp chat with them."
            />
          </>
        ) : null}
      </View>
      {missing ? (
        <Text variant="caption" tone="muted" style={{ marginTop: spacing.xs, marginLeft: 4 }}>
          They have not added a phone number yet. You can still message them here.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The same row for places that only know the conversation's id (the accepted-offer screen):
 * it loads the conversation to learn whether Call / WhatsApp are permitted, and shows Message
 * alone until it knows.
 */
export function ConversationContactActions({
  conversationId,
  onMessage,
}: {
  conversationId: string;
  onMessage: () => void;
}) {
  const conversation = useConversation(conversationId);
  return (
    <ContactActions
      conversationId={conversationId}
      canContact={conversation.data?.canContact ?? false}
      onMessage={onMessage}
    />
  );
}
