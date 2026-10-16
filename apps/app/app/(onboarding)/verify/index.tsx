import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ComponentProps } from 'react';
import { Alert, Platform, Text, View } from 'react-native';

import { Press } from '@pandam/ui';

import { useM } from '@/components/matches/MatchesUI';
import { CornerDecor } from '@/components/profile/ProfileUI';
import {
  Lead,
  PageTitle,
  ProgressSteps,
  VerifyShell,
  WideCta,
} from '@/components/verification/VerifyUI';
import { useLogout, useSession } from '@/lib/auth/hooks';
import { useThemeColors } from '@pandam/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** One verification step: pale-pink icon tile, title, description and its action. */
function StepCard({
  icon,
  title,
  description,
  done,
  locked,
  lockedHint,
  actionLabel,
  onPress,
}: {
  icon: IconName;
  title: string;
  description: string;
  done: boolean;
  locked?: boolean;
  lockedHint?: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const M = useM();

  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1.4,
        borderColor: M.line,
        backgroundColor: colors.surface,
        padding: 14,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 12,
            backgroundColor: M.pink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={42} color={M.red} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 20, color: M.ink }}>
              {title}
            </Text>
            {done ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-circle" size={17} color={M.red} />
                <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 14, color: M.red }}>
                  Verified
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={{
              fontFamily: 'InterTight_400Regular',
              fontSize: 15.5,
              lineHeight: 21,
              color: colors.textSecondary,
              marginTop: 2,
            }}
          >
            {description}
          </Text>
        </View>
      </View>
      {done ? null : (
        <View style={{ gap: 6 }}>
          <WideCta label={actionLabel} arrow={!locked} disabled={locked} onPress={onPress} />
          {locked && lockedHint ? (
            <Text
              style={{
                fontFamily: 'InterTight_400Regular',
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              {lockedHint}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * "Verify Your Identity" — the one-time onboarding hub. It reads each step's
 * status from the session, so leaving and coming back (even after logging out
 * and in again) resumes exactly where the user stopped.
 */
export default function VerifyIdentityScreen() {
  const M = useM();

  const colors = useThemeColors();

  const router = useRouter();
  const { user } = useSession();
  const logout = useLogout();
  const v = user?.identityVerification;
  const govDone = v?.governmentId === 'verified';
  const faceDone = v?.face === 'verified';
  const allDone = govDone && faceDone;

  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => router.replace('/(auth)/login') });
  // Only the "Sign out" word is tappable, and it asks first (Alert is a no-op on web).
  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out of Pandam?')) signOut();
      return;
    }
    Alert.alert('Sign out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <VerifyShell decor={undefined}>
      <CornerDecor height={260} />
      <View style={{ marginTop: 40 }}>
        <PageTitle>{'Verify Your\nIdentity'}</PageTitle>
        <Lead style={{ maxWidth: 262 }}>
          Complete a one-time identity verification to start using Pandam.
        </Lead>
      </View>

      <View style={{ marginTop: 22 }}>
        <ProgressSteps identityDone={allDone} completeDone={allDone} />
      </View>

      <View style={{ marginTop: 22, gap: 18 }}>
        <StepCard
          icon="id-card-outline"
          title="Government ID"
          description="Verify your identity using DigiLocker."
          done={govDone}
          actionLabel="Verify with DigiLocker"
          onPress={() => router.push('/(onboarding)/verify/digilocker')}
        />
        <StepCard
          icon="scan-outline"
          title="Face Verification"
          description="Take a quick selfie using your device camera."
          done={faceDone}
          locked={!govDone}
          lockedHint="Complete Government ID first."
          actionLabel="Verify My Face"
          onPress={() => router.push('/(onboarding)/verify/face')}
        />
      </View>

      {allDone ? (
        <View style={{ marginTop: 18 }}>
          <WideCta
            label="Continue"
            onPress={() => router.replace('/(onboarding)/verify/complete')}
          />
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 5,
          marginTop: 26,
        }}
      >
        <Text
          style={{
            fontFamily: 'InterTight_400Regular',
            fontSize: 14.5,
            color: colors.textSecondary,
          }}
        >
          Signed in as {user?.email}.
        </Text>
        <Press
          haptic="light"
          scale="md"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          hitSlop={8}
        >
          <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 14.5, color: M.red }}>
            Sign out
          </Text>
        </Press>
      </View>
    </VerifyShell>
  );
}
