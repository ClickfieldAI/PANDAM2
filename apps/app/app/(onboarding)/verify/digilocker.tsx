import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSession } from '@/lib/auth/hooks';
import {
  governmentIdVerifier,
  useApplyVerification,
  type VerificationStage,
} from '@/lib/verification';
import {
  CenterBody,
  CenterTitle,
  Concrete,
  IconTile,
  InfoPanel,
  Lead,
  NoteBox,
  PageTitle,
  RedRow,
  RedShape,
  SpinnerDisc,
  SuccessBadge,
  TextAction,
  VerifyShell,
  WideCta,
  useScreen,
} from '@/components/verification/VerifyUI';

type Step = 'intro' | 'consent' | 'working' | 'success' | 'cancelled' | 'failed';

/**
 * Government-ID verification via DigiLocker — DEMO.
 *
 * Deliberately PANDAM's own screens, not a copy of DigiLocker's UI: we explain
 * what will happen, ask for consent, then show progress. In production the
 * "Allow & Continue" step hands off to DigiLocker's real authorization page;
 * here the demo provider simulates it. Success is shown only after
 * `governmentIdVerifier.verify` actually resolves.
 */
export default function DigiLockerScreen() {
  const router = useRouter();
  const { user } = useSession();
  const apply = useApplyVerification();
  const { w, h } = useScreen();
  const alreadyDone = user?.identityVerification?.governmentId === 'verified';
  const [step, setStep] = useState<Step>(alreadyDone ? 'success' : 'intro');
  const [stage, setStage] = useState<VerificationStage>('connecting');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return; // never fire a second request while one is in flight
    setBusy(true);
    setStage('connecting');
    setStep('working');
    try {
      const result = await governmentIdVerifier.verify(setStage);
      apply(result);
      setStep('success');
    } catch {
      setStep('failed');
    } finally {
      setBusy(false);
    }
  };

  const toHub = () => router.replace('/(onboarding)/verify');

  /* ---------------------------------------------------------- intro -- */
  if (step === 'intro') {
    return (
      <VerifyShell
        onBack={() => (router.canGoBack() ? router.back() : toHub())}
        decor={
          <>
            <RedShape
              kind="lobe"
              width={170}
              height={150}
              style={{ right: -40, bottom: h * 0.06 }}
            />
            <Concrete size={150} rotate={-14} style={{ right: -30, bottom: -6 }} />
          </>
        }
      >
        <PageTitle>{'Verify with\nDigiLocker'}</PageTitle>
        <IconTile name="phone-portrait-outline" />
        <Lead style={{ marginTop: 16 }}>
          Pandam uses DigiLocker to verify your identity using an eligible government-issued digital
          document.
        </Lead>
        <View style={{ gap: 14, marginTop: 20 }}>
          <RedRow icon="lock-closed" bold>
            Secure verification
          </RedRow>
          <RedRow icon="hand-left" bold>
            User-controlled consent
          </RedRow>
          <RedRow icon="checkmark" bold>
            One-time verification
          </RedRow>
        </View>
        <View style={{ marginTop: 22 }}>
          <NoteBox>
            Your information is shared only with your consent and used only for verification.
          </NoteBox>
        </View>
        <View style={{ marginTop: 16 }}>
          <WideCta label="Continue" onPress={() => setStep('consent')} />
        </View>
      </VerifyShell>
    );
  }

  /* -------------------------------------------------------- consent -- */
  if (step === 'consent') {
    return (
      <VerifyShell
        onBack={() => setStep('intro')}
        decor={
          <>
            <RedShape
              kind="round"
              width={150}
              height={150}
              style={{ left: w * 0.3, bottom: -40 }}
            />
            <Concrete size={270} rotate={2} style={{ right: -70, bottom: -40 }} />
          </>
        }
      >
        <PageTitle>Authorization</PageTitle>
        <Lead>
          Pandam is requesting permission to access the information required for identity
          verification.
        </Lead>
        <View style={{ marginTop: 22 }}>
          <InfoPanel title="Information requested">
            <RedRow icon="person-outline">Name</RedRow>
            <RedRow icon="calendar-outline">Date of Birth</RedRow>
            <RedRow icon="document-text-outline">Eligible Government ID information</RedRow>
          </InfoPanel>
        </View>
        <View style={{ marginTop: 20 }}>
          <WideCta label="Allow & Continue" arrow={false} onPress={() => void run()} />
        </View>
        <View style={{ marginTop: 8 }}>
          <TextAction label="Cancel" onPress={() => setStep('cancelled')} />
        </View>
      </VerifyShell>
    );
  }

  /* -------------------------------------------------------- working -- */
  if (step === 'working') {
    return (
      <VerifyShell
        center
        decor={
          <>
            <RedShape kind="round" width={230} height={230} style={{ right: -70, bottom: -20 }} />
            <Concrete size={w * 0.72} rotate={-6} style={{ left: -w * 0.1, bottom: -30 }} />
          </>
        }
      >
        <View style={{ gap: 18, paddingBottom: h * 0.2 }}>
          <SpinnerDisc />
          <CenterTitle>
            {stage === 'connecting' ? 'Connecting\nsecurely...' : 'Verifying your\nidentity...'}
          </CenterTitle>
          <CenterBody>This usually takes a few seconds.</CenterBody>
        </View>
      </VerifyShell>
    );
  }

  /* -------------------------------------------------------- success -- */
  if (step === 'success') {
    return (
      <VerifyShell
        center
        decor={
          <>
            <RedShape kind="tall" width={190} height={250} style={{ left: -26, bottom: -10 }} />
            <Concrete size={w * 0.62} rotate={4} style={{ right: -w * 0.08, bottom: -20 }} />
          </>
        }
      >
        <View style={{ gap: 22, paddingBottom: h * 0.12 }}>
          <SuccessBadge />
          <CenterTitle>Identity Verified</CenterTitle>
          <WideCta
            label="Continue to face verification"
            onPress={() => router.replace('/(onboarding)/verify/face')}
          />
        </View>
      </VerifyShell>
    );
  }

  /* ---------------------------------------------- cancelled / failed -- */
  const cancelled = step === 'cancelled';
  return (
    <VerifyShell
      center
      decor={
        <>
          <RedShape kind="lobe" width={160} height={140} style={{ right: -40, bottom: 20 }} />
          <Concrete size={150} rotate={-14} style={{ right: -30, bottom: -6 }} />
        </>
      }
    >
      <View style={{ gap: 16, paddingBottom: h * 0.1 }}>
        <CenterTitle>{cancelled ? 'Verification\ncancelled' : 'Something\nwent wrong'}</CenterTitle>
        <CenterBody>
          {cancelled
            ? "You can verify whenever you're ready. Nothing was shared."
            : "We couldn't complete identity verification. Please try again."}
        </CenterBody>
        <WideCta
          label="Try again"
          arrow={false}
          onPress={() => (cancelled ? setStep('intro') : void run())}
        />
        <TextAction label="Back to verification" onPress={toHub} />
      </View>
    </VerifyShell>
  );
}
