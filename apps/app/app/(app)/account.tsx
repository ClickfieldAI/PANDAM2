/**
 * Account settings: signed-in devices, password, and account deletion.
 *
 * Deliberately plain and slightly severe compared with the rest of the app —
 * this is the screen where someone reacts to losing a phone or wanting out,
 * and decoration here would read as the product being cute about it.
 */
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, View } from 'react-native';

import { changePasswordSchema, passwordSchema, z } from '@pandam/validation';
import {
  Badge,
  Button,
  Card,
  Field,
  GroupedRows,
  IconFrame,
  ListRow,
  Notice,
  PasswordField,
  Row,
  Screen,
  SkeletonList,
  Stack,
  Text,
  colors,
  layout,
  spacing,
  useToast,
  haptic,
} from '@pandam/ui';

import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/lib/api/client';
import { type SessionView } from '@/lib/api/account';
import { useSession } from '@/lib/auth/hooks';
import { timeAgo } from '@/lib/format';
import {
  useChangePassword,
  useDeleteAccount,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from '@/lib/hooks/useAccount';

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

const deleteFormSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your password'),
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});
type DeleteFormValues = z.infer<typeof deleteFormSchema>;

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : error ? fallback : null;

/**
 * A user agent is the only thing we know about a device — no IP, no location.
 * It is unreadable raw, so pull out just the part a person can recognise.
 */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/iPhone|iPad|iOS/i.test(userAgent)) return 'iPhone or iPad';
  if (/Android/i.test(userAgent)) return 'Android device';
  if (/Macintosh|Mac OS/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows PC';
  if (/Expo|okhttp|CFNetwork/i.test(userAgent)) return 'PANDAM app';
  return 'Browser';
}

function DeviceRow({ session, onRevoke }: { session: SessionView; onRevoke: () => void }) {
  return (
    <ListRow
      leading={
        <IconFrame tone={session.current ? 'accent' : 'neutral'}>
          <Ionicons
            name={session.current ? 'phone-portrait-outline' : 'desktop-outline'}
            size={17}
            color={session.current ? colors.accent : colors.textSecondary}
          />
        </IconFrame>
      }
      title={deviceLabel(session.userAgent)}
      subtitle={
        session.active
          ? `Last used ${timeAgo(session.lastUsedAt ?? session.createdAt)}`
          : 'Signed out'
      }
      emphasis={session.current}
      trailing={
        session.current ? (
          <Badge label="This device" kind="have" />
        ) : session.active ? (
          <Button label="Remove" variant="quiet" size="sm" onPress={onRevoke} />
        ) : undefined
      }
    />
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useSession();
  const toast = useToast();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const changePassword = useChangePassword();
  const deleteAccount = useDeleteAccount();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const deleteForm = useForm<DeleteFormValues>({
    resolver: zodResolver(deleteFormSchema),
    defaultValues: { currentPassword: '', confirm: '' as unknown as 'DELETE' },
  });

  const activeOthers = (sessions.data ?? []).filter((s) => s.active && !s.current).length;

  const submitPassword = passwordForm.handleSubmit((values) => {
    const input = changePasswordSchema.parse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    changePassword.mutate(input, {
      onSuccess: (res) => {
        passwordForm.reset();
        setShowPasswordForm(false);
        // A confirmation, not a question — so a toast rather than an alert
        // that has to be dismissed before you can carry on.
        toast.success(
          res.otherSessionsRevoked > 0
            ? `Password updated. ${res.otherSessionsRevoked} other device${
                res.otherSessionsRevoked === 1 ? ' was' : 's were'
              } signed out.`
            : 'Password updated.',
        );
      },
    });
  });

  const submitDelete = deleteForm.handleSubmit((values) => {
    deleteAccount.mutate(values, {
      // The hook clears the session, so the root layout sends them to the
      // auth screens; this replace just avoids a frame of the dead screen.
      onSuccess: () => router.replace('/(auth)/login'),
    });
  });

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: layout.gutter, paddingTop: spacing.lg }}>
        <AppHeader title="Account" subtitle={user?.email ?? undefined} back />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: spacing['5xl'],
        }}
      >
        <Stack gap="2xl">
          {/* --------------------------------------------------- devices -- */}
          <Stack gap="md">
            <View>
              <Text variant="h3">Signed-in devices</Text>
              <Text variant="caption" tone="muted">
                Remove anything you do not recognise. We store only the device type — never a
                location.
              </Text>
            </View>

            {sessions.isPending ? (
              <SkeletonList count={2} />
            ) : sessions.isError ? (
              <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
            ) : (
              <Stack gap="sm">
                <GroupedRows separatorInset={spacing.lg + 38 + spacing.md}>
                  {(sessions.data ?? []).map((s) => (
                    <DeviceRow
                      key={s.id}
                      session={s}
                      onRevoke={() => {
                        haptic.warning();
                        Alert.alert(
                          s.current ? 'Sign out?' : 'Remove this device?',
                          s.current
                            ? 'You will be signed out of PANDAM on this device.'
                            : 'That device will have to sign in again.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: s.current ? 'Sign out' : 'Remove',
                              style: 'destructive',
                              onPress: () => revoke.mutate(s.id),
                            },
                          ],
                        );
                      }}
                    />
                  ))}
                </GroupedRows>
                {activeOthers > 0 ? (
                  <Button
                    label={`Sign out ${activeOthers} other device${activeOthers === 1 ? '' : 's'}`}
                    variant="ghost"
                    fullWidth
                    loading={revokeOthers.isPending}
                    onPress={() => revokeOthers.mutate()}
                    leftIcon={
                      <Ionicons name="log-out-outline" size={16} color={colors.textPrimary} />
                    }
                  />
                ) : null}
              </Stack>
            )}
          </Stack>

          {/* -------------------------------------------------- password -- */}
          <Stack gap="md">
            <View>
              <Text variant="h3">Password</Text>
              <Text variant="caption" tone="muted">
                Changing it signs out every other device.
              </Text>
            </View>

            {showPasswordForm ? (
              <Stack gap="lg">
                <Controller
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      label="Current password"
                      revealIcon={
                        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                      }
                      hideIcon={
                        <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
                      }
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      label="New password"
                      hint="At least 10 characters, with a letter and a number."
                      revealIcon={
                        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                      }
                      hideIcon={
                        <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
                      }
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field, fieldState }) => (
                    <PasswordField
                      label="Confirm new password"
                      revealIcon={
                        <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                      }
                      hideIcon={
                        <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
                      }
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                {message(changePassword.error, 'Could not change your password.') ? (
                  <Notice
                    kind="danger"
                    icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                  >
                    {message(changePassword.error, 'Could not change your password.')}
                  </Notice>
                ) : null}
                <Row gap="sm">
                  <Button
                    label="Update password"
                    style={{ flex: 1 }}
                    loading={changePassword.isPending}
                    onPress={submitPassword}
                  />
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => {
                      passwordForm.reset();
                      setShowPasswordForm(false);
                    }}
                  />
                </Row>
              </Stack>
            ) : (
              <Button
                label="Change password"
                variant="secondary"
                fullWidth
                onPress={() => setShowPasswordForm(true)}
                leftIcon={<Ionicons name="key-outline" size={16} color={colors.textPrimary} />}
              />
            )}
          </Stack>

          {/* ---------------------------------------------------- delete -- */}
          <Stack gap="md">
            <View>
              <Text variant="h3" tone="danger">
                Delete account
              </Text>
              <Text variant="caption" tone="muted">
                Your listings come out of circulation and you can never sign in again. Trades and
                messages you shared with other people are kept, because they are part of their
                history too.
              </Text>
            </View>

            {showDeleteForm ? (
              <Card padded tone="muted" bordered={false}>
                <Stack gap="lg">
                  <Controller
                    control={deleteForm.control}
                    name="currentPassword"
                    render={({ field, fieldState }) => (
                      <PasswordField
                        label="Your password"
                        revealIcon={
                          <Ionicons name="eye-outline" size={18} color={colors.textMuted} />
                        }
                        hideIcon={
                          <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
                        }
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  <Controller
                    control={deleteForm.control}
                    name="confirm"
                    render={({ field, fieldState }) => (
                      <Field
                        label="Type DELETE to confirm"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  {message(deleteAccount.error, 'Could not delete your account.') ? (
                    <Notice
                      kind="danger"
                      icon={<Ionicons name="alert-circle" size={16} color={colors.danger} />}
                    >
                      {message(deleteAccount.error, 'Could not delete your account.')}
                    </Notice>
                  ) : null}
                  <Row gap="sm">
                    <Button
                      label="Delete my account"
                      variant="danger"
                      style={{ flex: 1 }}
                      loading={deleteAccount.isPending}
                      onPress={submitDelete}
                    />
                    <Button
                      label="Keep it"
                      variant="ghost"
                      onPress={() => {
                        deleteForm.reset();
                        setShowDeleteForm(false);
                      }}
                    />
                  </Row>
                </Stack>
              </Card>
            ) : (
              <Button
                label="Delete account"
                variant="ghost"
                fullWidth
                onPress={() => setShowDeleteForm(true)}
                leftIcon={<Ionicons name="trash-outline" size={16} color={colors.danger} />}
              />
            )}
          </Stack>
        </Stack>
      </ScrollView>
    </Screen>
  );
}
