import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  LayoutAnimation,
  Platform,
  ScrollView,
  type ScrollViewProps,
  TextInput,
  View,
  type ViewProps,
} from 'react-native';

/** Breathing room kept between the focused field and the top of the keyboard. */
const MARGIN = 24;
const IS_WEB = Platform.OS === 'web';

/**
 * Where the keyboard's top edge is, in window coordinates, or null while it is hidden.
 * Shared by `KeyboardAvoid` and `KeyboardScrollView`.
 */
function useKeyboardTop(): { top: number | null; duration: number } {
  const [state, setState] = useState<{ top: number | null; duration: number }>({
    top: null,
    duration: 0,
  });
  useEffect(() => {
    if (IS_WEB) return undefined;
    const ios = Platform.OS === 'ios';
    const show = (e: KeyboardEvent) =>
      setState({ top: e.endCoordinates.screenY, duration: e.duration ?? 0 });
    const hide = (e?: KeyboardEvent) => setState({ top: null, duration: e?.duration ?? 0 });
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e) => {
        // iOS reports a "frame change" for hiding too: a frame that starts at the screen's bottom.
        if (ios && e.endCoordinates.height === 0) hide(e);
        else show(e);
      }),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', hide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return state;
}

/**
 * A flex container that lifts its content clear of the on-screen keyboard.
 *
 * `KeyboardAvoidingView` guesses the keyboard's size from the container's own frame and does
 * nothing on Android under edge-to-edge, which is why fields at the bottom of a screen ended
 * up hidden. This one measures instead: the gap between the container's bottom edge and the
 * keyboard's top edge becomes bottom padding. Already clear of the keyboard (the OS resized
 * the window, or an outer `KeyboardAvoid` lifted us) means zero padding, so nesting is safe.
 * Does nothing on web.
 */
export function KeyboardAvoid({ style, children, ...rest }: ViewProps) {
  const ref = useRef<View>(null);
  const { top, duration } = useKeyboardTop();
  const [pad, setPad] = useState(0);
  const padRef = useRef(0);

  useEffect(() => {
    if (IS_WEB) return undefined;
    if (top === null) {
      if (padRef.current !== 0) {
        if (Platform.OS === 'ios' && duration > 0) {
          LayoutAnimation.configureNext({ duration, update: { type: 'keyboard' } });
        }
        padRef.current = 0;
        setPad(0);
      }
      return undefined;
    }
    const id = requestAnimationFrame(() => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        // Our own padding sits inside the frame, so the bottom edge is unaffected by it.
        const next = Math.max(0, Math.round(y + h - top));
        if (next === padRef.current) return;
        if (Platform.OS === 'ios' && duration > 0) {
          LayoutAnimation.configureNext({ duration, update: { type: 'keyboard' } });
        }
        padRef.current = next;
        setPad(next);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [top, duration]);

  return (
    <View
      ref={ref}
      collapsable={false}
      {...rest}
      style={[{ flex: 1 }, style, { paddingBottom: pad }]}
    >
      {children}
    </View>
  );
}

/**
 * A ScrollView that scrolls the focused text field into view above the keyboard, and keeps
 * doing so as focus moves from field to field. Use it for any scrolling screen with inputs,
 * inside a `KeyboardAvoid` (the `Screen` wrapper already provides one).
 */
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardScrollView({ onScroll, ...props }, outerRef) {
    const ref = useRef<ScrollView>(null);
    useImperativeHandle(outerRef, () => ref.current as ScrollView);
    const scrollY = useRef(0);
    const { top } = useKeyboardTop();
    const lastFocused = useRef<unknown>(null);

    const reveal = useCallback(() => {
      if (top === null) return;
      const input = TextInput.State.currentlyFocusedInput?.();
      const scroller = ref.current;
      if (!input || !scroller) return;
      // A ScrollView instance forwards the host view's measure methods at runtime.
      (scroller as unknown as View).measureInWindow((_sx, sy, _sw, sh) => {
        input.measureInWindow((_ix, iy, _iw, ih) => {
          const visibleBottom = Math.min(sy + sh, top) - MARGIN;
          const visibleTop = sy + MARGIN;
          if (iy + ih > visibleBottom) {
            scroller.scrollTo({ y: scrollY.current + (iy + ih - visibleBottom), animated: true });
          } else if (iy < visibleTop) {
            scroller.scrollTo({
              y: Math.max(0, scrollY.current - (visibleTop - iy)),
              animated: true,
            });
          }
        });
      });
    }, [top]);

    // The keyboard just opened (wait for the lift to settle), then watch for focus moving on.
    useEffect(() => {
      if (IS_WEB || top === null) {
        lastFocused.current = null;
        return undefined;
      }
      const timers = [setTimeout(reveal, 120), setTimeout(reveal, 400)];
      const poll = setInterval(() => {
        const now = TextInput.State.currentlyFocusedInput?.() ?? null;
        if (now !== lastFocused.current) {
          lastFocused.current = now;
          if (now) reveal();
        }
      }, 200);
      return () => {
        timers.forEach(clearTimeout);
        clearInterval(poll);
      };
    }, [top, reveal]);

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        ref={ref}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
      />
    );
  },
);
