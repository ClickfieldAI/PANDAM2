import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type Tabs } from 'expo-router';
import { type ComponentProps, useEffect } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountBadge, Text, palette, useMotionOK, useThemeColors } from '@pandam/ui';

import { demoMatches, demoQuery } from '@/dummy';
import { useMatches } from '@/lib/hooks/useMatches';
import { TourTarget } from '@/lib/tour/TourTarget';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
type IconName = keyof typeof Ionicons.glyphMap;

/** Content height of the panel, before the safe-area inset is added below it. */
export const TAB_BAR_HEIGHT = 66;
const CREATE = 'create';
/** How far the centre square rises above the panel's top edge. */
const CREATE_LIFT = 20;
/** The centre square's own size. */
const CREATE_SIZE = 54;

const ICONS: Record<string, IconName> = {
  index: 'home-outline',
  discover: 'compass-outline',
  matches: 'sparkles-outline',
  profile: 'person-outline',
};
/** The filled icon shown while a tab is active (outline otherwise). */
const ICONS_ACTIVE: Record<string, IconName> = {
  index: 'home',
  discover: 'compass',
  matches: 'sparkles',
  profile: 'person',
};
const LABEL: Record<string, string> = {
  index: '01 HOME',
  discover: '02 DISCOVER',
  matches: '03 MATCHES',
  profile: '04 PROFILE',
};

/**
 * Each tab's own micro-motion on becoming active — the same pulse shape
 * (scale 1 → 1.10 → 1 over ~280ms) with a tiny per-tab personality so the
 * four don't feel mechanically identical: Home lifts, Discover and Matches
 * get a few degrees of rotation in opposite directions ("sparkle" reads as a
 * quick twist, not a spin), Profile just settles.
 */
const ICON_ROTATE: Record<string, number> = { index: 0, discover: 5, matches: -6, profile: 0 };
const ICON_LIFT: Record<string, number> = { index: -2, discover: 0, matches: 0, profile: 0 };

const EASE_OUT = Easing.out(Easing.cubic);
const AnimatedText = Animated.createAnimatedComponent(Text);

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
}

/* -------------------------------------------------------------------------- */

/** A navigation tab: outline icon + "01 LABEL", tinted orange when active —
 *  no block, no pill, no card behind it. */
function TabItem({
  name,
  focused,
  badge,
  onPress,
  onLongPress,
}: {
  name: string;
  focused: boolean;
  badge?: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  // Immediate tactile press feedback — independent of the focus animation
  // below, so it fires on every touch even when the tab is already active.
  const press = useSharedValue(1);
  // Persistent 0/1 focus state: drives the smooth orange cross-fade and the
  // label's settle-in, over the tab's full "is this the active one" life —
  // not just the moment it's tapped.
  const on = useSharedValue(focused ? 1 : 0);
  // One-shot 0→1 impulse: the icon's little scale/rotate/lift pulse that
  // plays once, right when the tab becomes active.
  const pulse = useSharedValue(0);

  useEffect(() => {
    on.set(
      motionOK ? withTiming(focused ? 1 : 0, { duration: 280, easing: EASE_OUT }) : focused ? 1 : 0,
    );
    if (focused) {
      pulse.set(0);
      pulse.set(motionOK ? withTiming(1, { duration: 280, easing: EASE_OUT }) : 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, motionOK]);

  const iconStyle = useAnimatedStyle(() => {
    const bump = interpolate(pulse.value, [0, 0.5, 1], [1, 1.1, 1]);
    const rotate = interpolate(pulse.value, [0, 0.5, 1], [0, ICON_ROTATE[name] ?? 0, 0]);
    const lift = interpolate(pulse.value, [0, 0.5, 1], [0, ICON_LIFT[name] ?? 0, 0]);
    return {
      transform: [{ scale: bump * press.value }, { rotate: `${rotate}deg` }, { translateY: lift }],
    };
  });
  const offIconStyle = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const onIconStyle = useAnimatedStyle(() => ({ opacity: on.value }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(on.value, [0, 1], [0.6, 1]),
    transform: [
      { translateY: interpolate(on.value, [0, 1], [2, 0]) },
      { scale: interpolate(on.value, [0, 1], [0.97, 1]) },
    ],
    color: interpolateColor(on.value, [0, 1], [colors.textPrimary, colors.accent]),
  }));

  const onPressIn = () => {
    if (motionOK) press.set(withTiming(0.96, { duration: 110, easing: EASE_OUT }));
  };
  const onPressOut = () => {
    if (motionOK) press.set(withTiming(1, { duration: 130, easing: EASE_OUT }));
  };
  const handlePress = () => {
    tap();
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={LABEL[name]}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={handlePress}
      onLongPress={onLongPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: TAB_BAR_HEIGHT,
        gap: 4,
      }}
    >
      <View>
        {/* Two stacked icons cross-fade (outline -> filled, ink -> accent); plain
            Ionicons inside Animated.Views, so nothing animates the icon's own props. */}
        <Animated.View style={iconStyle}>
          <Animated.View style={offIconStyle}>
            <Ionicons name={ICONS[name]!} size={22} color={colors.textPrimary} />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, onIconStyle]}>
            <Ionicons name={ICONS_ACTIVE[name]!} size={22} color={colors.accent} />
          </Animated.View>
        </Animated.View>
        {badge ? (
          <CountBadge
            value={badge}
            color={colors.match}
            ringColor={colors.background}
            style={{ position: 'absolute', top: -6, left: 14 }}
          />
        ) : null}
      </View>
      <AnimatedText
        style={[
          {
            fontSize: 10,
            fontFamily: 'InterTight_600SemiBold',
            letterSpacing: 0.4,
          },
          labelStyle,
        ]}
      >
        {LABEL[name]}
      </AnimatedText>
    </Pressable>
  );
}

/** A hairline between neighbouring tabs, shorter than the bar like the reference. */
function TabDivider() {
  const colors = useThemeColors();

  return (
    <View
      pointerEvents="none"
      style={{ width: 1, height: 38, alignSelf: 'center', backgroundColor: colors.surfaceMuted }}
    />
  );
}

/** The signature centre action: an orange rounded square that physically
 *  breaks through the panel's top edge — not a circular FAB, not inside a
 *  tab column. */
function CreateButton({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();

  const motionOK = useMotionOK();
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  const square = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: -CREATE_LIFT,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <TourTarget id="tab-create">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add something"
          onPress={() => {
            if (motionOK) {
              // 1 → 0.92 → 1.04 → 1: a quick, weighty tap-down then a tiny
              // overshoot settle — not a bounce, one controlled correction.
              scale.set(
                withSequence(
                  withTiming(0.92, { duration: 90, easing: EASE_OUT }),
                  withTiming(1.04, { duration: 120, easing: EASE_OUT }),
                  withTiming(1, { duration: 110, easing: EASE_OUT }),
                ),
              );
              rotate.set(
                withSequence(
                  withTiming(-4, { duration: 90, easing: EASE_OUT }),
                  withTiming(3, { duration: 120, easing: EASE_OUT }),
                  withTiming(0, { duration: 110, easing: EASE_OUT }),
                ),
              );
            }
            if (Platform.OS !== 'web') {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            }
            onPress();
          }}
          hitSlop={8}
        >
          <Animated.View
            style={[
              {
                width: CREATE_SIZE,
                height: CREATE_SIZE,
                borderRadius: 15,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.accent,
                shadowOpacity: 0.38,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 7 },
                elevation: 10,
              },
              square,
            ]}
          >
            <Ionicons name="add" size={32} color={palette.white} />
          </Animated.View>
        </Pressable>
      </TourTarget>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * PANDAM's navigation: a large off-white organic sheet overlaying the page
 * (not pushing content up), strongly rounded top corners, a thin black
 * structural top border, four numbered tabs with a refined orange tint on
 * the active one (no block, no pill), and a black-bordered orange square
 * breaking through the top edge as the centre "add" action. Navigation
 * behaviour is React Navigation's own (`tabPress` event, `navigate`), so
 * routes and deep links are unchanged — only the visual shell is rebuilt.
 */
export function PandamTabBar({ state, navigation }: TabBarProps) {
  const colors = useThemeColors();

  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const matches = demoQuery(useMatches(), demoMatches);
  const matchCount = matches.data?.length ?? 0;

  const routes = state.routes;
  const focusedName = routes[state.index]?.name;
  const createW = 72;

  const go = (routeName: string, key: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  const maxW = Math.min(screenW, 720);
  const side = routes.filter((r) => r.name !== CREATE);
  const left = side.slice(0, 2);
  const right = side.slice(2);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}
    >
      <TourTarget id="tab-bar" style={{ width: maxW }}>
        <View
          style={{
            width: maxW,
            // The panel is an overlay, not a layout element the page scrolls
            // above — content keeps running underneath it, exactly like a
            // bottom sheet attached to the device edge.
            paddingBottom: insets.bottom,
            backgroundColor: colors.background,
            borderTopLeftRadius: 34,
            borderTopRightRadius: 34,
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.border,
            overflow: 'visible',
            shadowColor: colors.border,
            shadowOpacity: 0.08,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: -4 },
            elevation: 6,
          }}
        >
          <View style={{ height: TAB_BAR_HEIGHT, flexDirection: 'row' }}>
            {left.map((route, i) => {
              const focused = route.name === focusedName;
              if (!ICONS[route.name]) return null;
              return (
                <View key={route.key} style={{ flex: 1, flexDirection: 'row' }}>
                  {i > 0 ? <TabDivider /> : null}
                  <TabItem
                    name={route.name}
                    focused={focused}
                    badge={route.name === 'matches' ? matchCount : undefined}
                    onPress={() => go(route.name, route.key, focused)}
                    onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                  />
                </View>
              );
            })}

            {/* Reserves the centre slot the floating button sits over — the
              button itself is absolutely positioned above the panel, never
              inside this row, so it can break through the top edge. */}
            <View style={{ width: createW }} />

            {right.map((route) => {
              const focused = route.name === focusedName;
              if (!ICONS[route.name]) return null;
              return (
                <View key={route.key} style={{ flex: 1, flexDirection: 'row' }}>
                  <TabDivider />
                  <TabItem
                    name={route.name}
                    focused={focused}
                    badge={route.name === 'matches' ? matchCount : undefined}
                    onPress={() => go(route.name, route.key, focused)}
                    onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                  />
                </View>
              );
            })}
          </View>

          {routes
            .filter((r) => r.name === CREATE)
            .map((route) => {
              const focused = route.name === focusedName;
              return (
                <CreateButton key={route.key} onPress={() => go(route.name, route.key, focused)} />
              );
            })}
        </View>
      </TourTarget>
    </View>
  );
}
