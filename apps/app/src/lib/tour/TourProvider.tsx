import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, View } from 'react-native';

import { type Rect, tourRegistry } from './registry';
import { TOUR_STEPS } from './steps';
import { loadTourStatus, saveTourStatus, type TourStatus } from './storage';
import { TourOverlay, type TourPhase } from './TourOverlay';

interface TourApi {
  /** (Re)starts the tour from the welcome card. Safe to call at any time. */
  start: () => void;
}

const TourContext = createContext<TourApi>({ start: () => undefined });
export const useTour = () => useContext(TourContext);

/** How long to wait for a step's screen to mount and settle before skipping it. */
const TARGET_TIMEOUT_MS = 4500;
/** Delay before the welcome card, so the home screen has painted first. */
const WELCOME_DELAY_MS = 800;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const same = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 1 &&
  Math.abs(a.y - b.y) < 1 &&
  Math.abs(a.width - b.width) < 1 &&
  Math.abs(a.height - b.height) < 1;

function buzz(style: 'light' | 'success') {
  if (Platform.OS === 'web') return;
  if (style === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  } else {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }
}

/**
 * Owns the tour: persisted per-user status, the welcome / spotlight / done
 * phases, cross-screen navigation and target measurement. Mount it once the
 * user is signed in and verified, keyed by user id, so a different account
 * always starts from its own state.
 */
export function TourProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<TourPhase>('idle');
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const status = useRef<TourStatus | null>(null);
  const loaded = useRef(false);
  const offered = useRef(false);
  /** Invalidates in-flight measurements when the user moves on quickly. */
  const run = useRef(0);
  const route = useRef<string | null>(null);
  /** Lets `goTo` call itself when it skips a missing target. */
  const goToRef = useRef<(target: number, dir: 1 | -1) => Promise<void>>(async () => undefined);

  const finish = useCallback(
    (next: TourStatus) => {
      run.current += 1;
      setRect(null);
      // A skipped replay must not downgrade an already-completed tour.
      if (!(next === 'skipped' && status.current === 'completed')) {
        status.current = next;
        void saveTourStatus(userId, next);
      }
      if (next === 'completed') {
        buzz('success');
        setPhase('done');
      } else {
        setPhase('idle');
      }
    },
    [userId],
  );

  const goTo = useCallback(
    async (target: number, dir: 1 | -1) => {
      const id = ++run.current;
      const step = TOUR_STEPS[target];
      if (!step) {
        finish(dir > 0 ? 'completed' : 'skipped');
        return;
      }
      setIndex(target);
      setRect(null);

      if (route.current !== step.route) {
        route.current = step.route;
        router.navigate(step.route as never);
      }

      // Wait for the destination screen to mount, scroll the target into view
      // and report the same position twice in a row (i.e. layout has settled).
      const deadline = Date.now() + TARGET_TIMEOUT_MS;
      let last: Rect | null = null;
      let scrolled = false;
      while (Date.now() < deadline) {
        if (id !== run.current) return;
        const handle = tourRegistry.get(step.target);
        if (handle) {
          if (!scrolled) {
            scrolled = true;
            await handle.scrollIntoView();
            if (id !== run.current) return;
          }
          const r = await handle.measure();
          if (id !== run.current) return;
          if (r && last && same(r, last)) {
            setRect(r);
            return;
          }
          last = r;
        }
        await sleep(70);
      }
      if (id !== run.current) return;
      // Target never appeared (hidden / conditionally rendered): move on.
      const next = target + dir;
      if (next < 0) finish('skipped');
      else void goToRef.current(next, dir);
    },
    [finish, router],
  );

  useEffect(() => {
    goToRef.current = goTo;
  }, [goTo]);

  const begin = useCallback(() => {
    buzz('light');
    setPhase('tour');
    route.current = null;
    void goTo(0, 1);
  }, [goTo]);

  const start = useCallback(() => {
    run.current += 1;
    setRect(null);
    setIndex(0);
    setPhase('welcome');
    buzz('light');
  }, []);

  // Load this account's saved status, then offer the tour once if it has none.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void loadTourStatus(userId).then((saved) => {
      if (cancelled) return;
      status.current = saved;
      loaded.current = true;
      if (saved === null && !offered.current) {
        offered.current = true;
        timer = setTimeout(start, WELCOME_DELAY_MS);
      }
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [userId, start]);

  const api = useMemo<TourApi>(() => ({ start }), [start]);

  return (
    <TourContext.Provider value={api}>
      <View style={{ flex: 1 }}>
        {children}
        <TourOverlay
          phase={phase}
          step={phase === 'tour' ? (TOUR_STEPS[index] ?? null) : null}
          index={index}
          total={TOUR_STEPS.length}
          rect={rect}
          onStart={begin}
          onNext={() => {
            buzz('light');
            void goTo(index + 1, 1);
          }}
          onPrev={() => {
            buzz('light');
            void goTo(index - 1, -1);
          }}
          onSkip={() => finish('skipped')}
          onFinish={() => finish('completed')}
          onDismissDone={() => {
            setPhase('idle');
            router.navigate('/(app)/(tabs)' as never);
          }}
        />
      </View>
    </TourContext.Provider>
  );
}
