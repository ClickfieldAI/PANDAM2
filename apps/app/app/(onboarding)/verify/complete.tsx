import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';

import {
  CenterBody,
  CenterTitle,
  Concrete,
  ProgressSteps,
  RedShape,
  SuccessBadge,
  SummaryRow,
  VerifyShell,
  WideCta,
  useScreen,
} from '@/components/verification/VerifyUI';
import { useSession } from '@/lib/auth/hooks';
import { useThemeColors } from '@pandam/ui';

/**
 * "Identity Verification Complete" — the last onboarding step before Home.
 * Only reachable once the account really is verified; each row reflects the
 * session's own per-step status rather than a hard-coded "Verified".
 */
export default function VerificationCompleteScreen() {
  const colors = useThemeColors();

  const router = useRouter();
  const { user } = useSession();
  const { w } = useScreen();
  if (user?.identityVerification?.status !== 'verified') {
    return <Redirect href="/(onboarding)/verify" />;
  }
  const v = user.identityVerification;
  const govOk = v.governmentId === 'verified';
  const faceOk = v.face === 'verified';

  return (
    <VerifyShell
      decor={
        <>
          <RedShape
            kind="lobe"
            width={w * 0.4}
            height={w * 0.37}
            style={{ right: -w * 0.14, top: 40 }}
          />
          <Concrete size={w * 0.26} rotate={20} style={{ right: -w * 0.08, top: 62 }} />
        </>
      }
    >
      <View style={{ marginTop: 8 }}>
        <ProgressSteps identityDone completeDone />
      </View>
      <View style={{ marginTop: 26, gap: 14 }}>
        <SuccessBadge shield size={104} />
        <CenterTitle size={30}>{'Identity Verification\nComplete'}</CenterTitle>
        <CenterBody>Your Pandam account is now verified.</CenterBody>
      </View>
      <View
        style={{
          marginTop: 18,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <SummaryRow label="Government ID" status={govOk ? 'Verified' : 'Pending'} ok={govOk} />
        <SummaryRow
          label="Face Verification"
          status={faceOk ? 'Verified' : 'Pending'}
          ok={faceOk}
        />
        {/* PANDAM has no phone number / phone verification, so we do not claim one. */}
        <SummaryRow label="Account" status="Active" ok />
      </View>
      <View style={{ marginTop: 18 }}>
        <WideCta label="Continue to Pandam" onPress={() => router.replace('/(app)/(tabs)')} />
      </View>
    </VerifyShell>
  );
}
