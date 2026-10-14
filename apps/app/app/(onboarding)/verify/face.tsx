import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, colors, layout, palette, radii, spacing } from '@pandam/ui';

import {
  CameraShape,
  CenterBody,
  CenterTitle,
  Concrete,
  Lead,
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
import { useSession } from '@/lib/auth/hooks';
import { faceVerifier, useApplyVerification } from '@/lib/verification';

type Step =
  'intro' | 'camera' | 'preview' | 'working' | 'success' | 'denied' | 'captureError' | 'failed';
type CamStage = 'position' | 'detected' | 'checking' | 'capturing';

const CAM_PROMPT: Record<CamStage, string> = {
  position: 'Position your face inside the frame',
  detected: 'Face detected',
  checking: 'Checking position',
  capturing: 'Capturing',
};

/**
 * Face verification — DEMO.
 *
 * Opens the FRONT camera with a face guide, walks through staged prompts, and
 * captures one frame. It does NOT detect faces, check liveness or match
 * biometrics — the prompts are timed, and the screen says "Demo". The photo
 * never leaves the device and is discarded after this screen.
 */
export default function FaceVerificationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { w, h } = useScreen();
  const { user } = useSession();
  const apply = useApplyVerification();
  const [permission, requestPermission] = useCameraPermissions();
  const alreadyDone = user?.identityVerification?.face === 'verified';

  const [step, setStep] = useState<Step>(alreadyDone ? 'success' : 'intro');
  const [camStage, setCamStage] = useState<CamStage>('position');
  const [photo, setPhoto] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraView>(null);

  // Timed demo prompts, then capture. Restarts whenever the camera reopens.
  useEffect(() => {
    if (step !== 'camera' || !ready) return undefined;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    at(1500, () => setCamStage('detected'));
    at(2500, () => setCamStage('checking'));
    at(3500, () => setCamStage('capturing'));
    at(3900, async () => {
      try {
        const pic = await camera.current?.takePictureAsync({ quality: 0.6 });
        if (cancelled) return;
        if (!pic?.uri) throw new Error('no image');
        setPhoto(pic.uri);
        setStep('preview');
      } catch {
        if (!cancelled) setStep('captureError');
      }
    });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [step, ready]);

  const openCamera = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      setStep('denied');
      return;
    }
    setCamStage('position');
    setReady(false);
    setPhoto(null);
    setStep('camera');
  };

  const submit = async () => {
    if (!photo) return;
    setStep('working');
    try {
      const result = await faceVerifier.submit(photo, () => undefined);
      apply(result);
      setPhoto(null); // discard the selfie
      setStep('success');
    } catch {
      setStep('failed');
    }
  };

  const toHub = () => router.replace('/(onboarding)/verify');
  const canAskAgain = permission?.canAskAgain !== false;

  /* ---------------------------------------------------------- camera -- */
  if (step === 'camera') {
    const good = camStage !== 'position';
    return (
      <View style={{ flex: 1, backgroundColor: palette.ink }}>
        <CameraView
          ref={camera}
          facing="front"
          style={{ position: 'absolute', inset: 0 }}
          onCameraReady={() => setReady(true)}
          onMountError={() => setStep('captureError')}
        />
        {/* dim the edges so the face guide reads */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(20,14,10,0.35)' }}
        />

        <View
          style={{
            paddingTop: insets.top + spacing.md,
            paddingHorizontal: layout.gutter,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            onPress={() => setStep('intro')}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color={palette.white} />
          </Pressable>
          <Text style={{ color: palette.white, fontWeight: '700', fontSize: 15 }}>
            Face Verification
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          pointerEvents="none"
        >
          <View
            style={{
              width: 240,
              height: 310,
              borderRadius: 150,
              borderWidth: 4,
              borderColor: good ? colors.matchBright : 'rgba(255,255,255,0.85)',
            }}
          />
        </View>

        <View
          style={{
            paddingBottom: insets.bottom + spacing['2xl'],
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              backgroundColor: 'rgba(20,14,10,0.7)',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radii.pill,
            }}
            accessibilityLiveRegion="polite"
          >
            <Ionicons
              name={good ? 'checkmark-circle' : 'scan-outline'}
              size={18}
              color={good ? colors.matchBright : palette.white}
            />
            <Text style={{ color: palette.white, fontWeight: '600' }}>
              {ready ? CAM_PROMPT[camStage] : 'Starting camera…'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  /* ------------------------------------------------------------- rest -- */
  const decorProblem = (
    <>
      <RedShape kind="lobe" width={160} height={140} style={{ right: -40, bottom: 20 }} />
      <Concrete size={150} rotate={-14} style={{ right: -30, bottom: -6 }} />
    </>
  );

  if (step === 'intro') {
    return (
      <VerifyShell
        onBack={() => (router.canGoBack() ? router.back() : toHub())}
        decor={
          <>
            <RedShape
              kind="tall"
              width={w * 0.5}
              height={w * 0.58}
              style={{ right: -w * 0.1, top: 30 }}
            />
            <CameraShape size={w * 0.36} style={{ right: -w * 0.16, top: 150 }} />
          </>
        }
      >
        <PageTitle size={38}>Face Verification</PageTitle>
        <Lead style={{ maxWidth: 270 }}>
          We&apos;ll use your device camera to capture your face.
        </Lead>
        <View style={{ gap: 18, marginTop: 24 }}>
          <RedRow icon="happy-outline">Keep your face clearly visible</RedRow>
          <RedRow icon="sunny-outline">Use a well-lit environment</RedRow>
          <RedRow icon="glasses-outline">Remove anything covering your face</RedRow>
          <RedRow icon="scan-outline">Position your face inside the frame</RedRow>
        </View>
        <Text variant="bodySm" style={{ color: '#555', marginTop: 24 }}>
          Your photo is used only for this verification.
        </Text>
        <View style={{ marginTop: 16 }}>
          <WideCta label="Start Face Verification" onPress={() => void openCamera()} />
        </View>
      </VerifyShell>
    );
  }

  if (step === 'preview' && photo) {
    return (
      <VerifyShell onBack={() => void openCamera()}>
        <PageTitle>{'Check your\nphoto'}</PageTitle>
        <View style={{ alignItems: 'center', marginTop: 22, gap: 16 }}>
          <Image
            source={{ uri: photo }}
            style={{ width: 240, height: 310, borderRadius: 150, backgroundColor: '#EDEBE6' }}
            resizeMode="cover"
            accessibilityLabel="Your captured selfie"
          />
          <CenterBody>Make sure your whole face is visible and in focus.</CenterBody>
        </View>
        <View style={{ marginTop: 22, gap: 4 }}>
          <WideCta label="Continue" onPress={() => void submit()} />
          <TextAction label="Retake" onPress={() => void openCamera()} />
        </View>
      </VerifyShell>
    );
  }

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
          <CenterTitle>Verifying...</CenterTitle>
          <CenterBody>This usually takes a few seconds.</CenterBody>
        </View>
      </VerifyShell>
    );
  }

  if (step === 'success') {
    return (
      <VerifyShell
        center
        decor={
          <>
            <RedShape kind="wave" width={w} height={h * 0.36} style={{ left: 0, bottom: 0 }} />
            <Concrete size={w * 0.5} rotate={-8} style={{ right: -w * 0.1, bottom: -20 }} />
          </>
        }
      >
        <View style={{ gap: 22, paddingBottom: h * 0.14 }}>
          <SuccessBadge />
          <CenterTitle>{'Face Verification\nComplete'}</CenterTitle>
          <WideCta
            label="Continue"
            onPress={() =>
              router.replace(
                user?.identityVerification?.status === 'verified'
                  ? '/(onboarding)/verify/complete'
                  : '/(onboarding)/verify',
              )
            }
          />
        </View>
      </VerifyShell>
    );
  }

  const problem =
    step === 'denied'
      ? {
          title: 'Camera access\nneeded',
          body: 'Camera access is required for face verification.',
        }
      : step === 'captureError'
        ? {
            title: "Couldn't\ncapture",
            body: "We couldn't capture your face clearly. Please try again.",
          }
        : {
            title: 'Something\nwent wrong',
            body: "We couldn't complete face verification. Please try again.",
          };

  return (
    <VerifyShell center decor={decorProblem}>
      <View style={{ gap: 16, paddingBottom: h * 0.1 }}>
        <CenterTitle>{problem.title}</CenterTitle>
        <CenterBody>{problem.body}</CenterBody>
        {step === 'denied' ? (
          canAskAgain || Platform.OS === 'web' ? (
            <WideCta label="Allow camera" arrow={false} onPress={() => void openCamera()} />
          ) : (
            <WideCta
              label="Open settings"
              arrow={false}
              onPress={() => void Linking.openSettings()}
            />
          )
        ) : step === 'failed' ? (
          <WideCta label="Try again" arrow={false} onPress={() => void submit()} />
        ) : (
          <WideCta label="Try again" arrow={false} onPress={() => void openCamera()} />
        )}
        {step === 'failed' ? (
          <TextAction label="Retake photo" onPress={() => void openCamera()} />
        ) : (
          <TextAction label="Back to verification" onPress={toHub} />
        )}
      </View>
    </VerifyShell>
  );
}
