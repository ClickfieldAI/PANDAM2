import { type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { type ScrollView, type StyleProp, View, type ViewStyle } from 'react-native';

import { type Rect, tourRegistry } from './registry';
import type { TourTargetId } from './steps';

/**
 * Marks a real piece of UI as something the tour can spotlight. It renders a
 * plain wrapper View (`collapsable={false}` so Android keeps a native view to
 * measure) and registers a measure handle under `id`.
 *
 * Pass `scrollRef` when the target sits inside a scrolling `Screen`, so the
 * tour can bring it on screen before measuring.
 */
export function TourTarget({
  id,
  children,
  style,
  scrollRef,
}: {
  id: TourTargetId;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const viewRef = useRef<View>(null);

  useEffect(() => {
    return tourRegistry.register(id, {
      measure: () =>
        new Promise<Rect | null>((resolve) => {
          const node = viewRef.current;
          if (!node) return resolve(null);
          node.measureInWindow((x, y, width, height) => {
            resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
          });
        }),
      scrollIntoView: () =>
        new Promise<void>((resolve) => {
          const node = viewRef.current;
          const scroller = scrollRef?.current;
          const inner =
            (
              scroller as unknown as { getInnerViewRef?: () => unknown } | null | undefined
            )?.getInnerViewRef?.() ?? scroller?.getInnerViewNode();
          if (!node || !scroller || !inner) return resolve();
          node.measureLayout(
            inner as never,
            (_x, y) => {
              scroller.scrollTo({ y: Math.max(0, y - 160), animated: false });
              // Give the native scroll a frame to apply before measuring.
              setTimeout(resolve, 80);
            },
            () => resolve(),
          );
        }),
    });
  }, [id, scrollRef]);

  return (
    <View ref={viewRef} collapsable={false} style={style}>
      {children}
    </View>
  );
}
