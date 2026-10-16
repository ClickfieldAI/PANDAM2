/**
 * The Matches screen's visual layer — a faithful recreation of the supplied
 * reference design (three empty states: Mirrors, Received, Sent).
 *
 * Everything here is presentation only. Data, navigation and actions stay in
 * `app/(app)/(tabs)/matches.tsx`; this file just renders the header, the tab
 * control, the filter chips, the illustrated empty states and the decoration.
 *
 * Product photographs and the concrete shape are the supplied assets
 * (`assets/matches/*`, cropped from the supplied moodboard); the blobs, accent
 * strokes and scribble have no separate asset, so they are drawn with SVG.
 */
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Press, haptic } from '@pandam/ui';
import { useThemeColors } from '@pandam/ui';

/* ----------------------------- design tokens ------------------------------ */

export function useM() {
  const c = useThemeColors();
  return {
    red: '#FF3B2F',
    redPressed: '#E02F1F',
    ink: c.textPrimary,
    /** Dark fill for "I NEED" surfaces (stays dark-ish in both themes, white text on it). */
    inkFill: c.need,
    line: c.border,
    secondary: c.textMuted,
    bg: c.background,
    border: c.borderSoft,
    surface: c.surface,
    pink: c.accentSoft,
    track: c.surfaceMuted,
  };
}

const TITLE = 'InterTight_900Black';
const BOLD = 'InterTight_700Bold';
const INTER = 'InterTight_400Regular';

const INTER_SEMI = 'InterTight_600SemiBold';
const INTER_BOLD = 'InterTight_700Bold';

const photo = {
  camera: require('../../../assets/matches/camera.webp') as number,
  laptop: require('../../../assets/matches/laptop.webp') as number,
  chair: require('../../../assets/matches/chair.webp') as number,
  headphones: require('../../../assets/matches/headphones.webp') as number,
  concrete: require('../../../assets/matches/concrete.webp') as number,
};

/** Page gutter, measured from the reference (22pt on a 393pt screen). */
export const GUTTER = 22;

/* ------------------------------- decoration ------------------------------- */

export function RedBlob({ width = 108, height = 100 }: { width?: number; height?: number }) {
  const M = useM();

  return (
    <Svg width={width} height={height} viewBox="0 0 120 110">
      <Path
        d="M32,6 C58,-6 104,2 114,30 C121,52 102,66 92,88 C84,104 62,112 46,96 C35,86 42,70 31,62 C14,52 -3,40 6,26 C11,17 21,11 32,6 Z"
        fill={M.red}
      />
    </Svg>
  );
}

function PinkBlob({ width, height }: { width: number; height: number }) {
  const M = useM();

  return (
    <Svg width={width} height={height} viewBox="0 0 300 250" preserveAspectRatio="none">
      <Path
        d="M62,38 C104,-4 196,-6 240,30 C288,70 302,142 272,192 C242,242 152,258 96,238 C34,214 8,152 20,102 C26,74 40,54 62,38 Z"
        fill={M.pink}
      />
    </Svg>
  );
}

/** Three short hand-drawn strokes that "burst" off a corner. */
function AccentLines({ size = 52 }: { size?: number }) {
  const M = useM();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M14,10 L4,50 M42,52 L90,16 M56,82 L98,84"
        stroke={M.ink}
        strokeWidth={5.5}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** The curved hand-drawn scribble that trails off an illustration. */
function Scribble({ width = 108 }: { width?: number }) {
  const M = useM();

  return (
    <Svg width={width} height={width * 0.5} viewBox="0 0 150 75">
      <Path
        d="M34,6 C8,12 -2,32 22,42 C50,53 92,40 114,56 C122,62 130,60 136,54"
        stroke={M.ink}
        strokeWidth={4.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * Decoration that sits behind a Matches screen's content: the red organic shape
 * and concrete form at the top-right, the concrete form and red shape at the
 * bottom-left. Purely visual (never intercepts touches).
 */
export function MatchesDecor() {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 430);
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {/* top-right: a concrete slab sliding in from the edge, the red blob beside the title */}
      <Image
        source={photo.concrete}
        resizeMode="contain"
        style={{
          position: 'absolute',
          top: -30,
          right: -178,
          width: 230,
          height: 205,
          transform: [{ rotate: '34deg' }],
        }}
      />
      <View style={{ position: 'absolute', top: 10, right: 30 }}>
        <RedBlob width={98} height={90} />
      </View>
      {/* bottom-left: concrete sliver off the edge, red blob behind the add button */}
      <Image
        source={photo.concrete}
        resizeMode="contain"
        style={{
          position: 'absolute',
          bottom: 30,
          left: -194,
          width: 260,
          height: 232,
          transform: [{ rotate: '-24deg' }],
        }}
      />
      <View style={{ position: 'absolute', bottom: 2, left: w * 0.25 }}>
        <RedBlob width={92} height={68} />
      </View>
    </View>
  );
}

/* --------------------------------- header --------------------------------- */

export type MatchesTab = 'reciprocal' | 'received' | 'sent';

export function MatchesHeader({
  tab,
  receivedLabel,
  onTab,
  onSettings,
  trailing,
}: {
  tab: MatchesTab;
  receivedLabel: string;
  onTab: (tab: MatchesTab) => void;
  onSettings: () => void;
  trailing?: ReactNode;
}) {
  const M = useM();

  const colors = useThemeColors();

  const options: { value: MatchesTab; label: string }[] = [
    { value: 'reciprocal', label: 'Mirrors' },
    { value: 'received', label: receivedLabel },
    { value: 'sent', label: 'Sent' },
  ];
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BOLD,
              fontSize: 19,
              lineHeight: 24,
              color: M.red,
              letterSpacing: 0.5,
            }}
          >
            03
          </Text>
          <Text
            style={{
              fontFamily: TITLE,
              fontSize: 53,
              lineHeight: 56,
              letterSpacing: -2.6,
              color: M.ink,
              marginTop: -1,
            }}
          >
            Matches
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 30 }}>
          {trailing}
          <Press
            haptic="light"
            scale="lg"
            accessibilityLabel="Account settings"
            onPress={onSettings}
            hitSlop={6}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: M.surface,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
          >
            <Ionicons name="settings" size={22} color={M.ink} />
          </Press>
        </View>
      </View>
      <Text
        style={{
          fontFamily: INTER,
          fontSize: 13.2,
          lineHeight: 19,
          color: colors.textSecondary,
          marginTop: 2,
        }}
      >
        Who you mirror, and who already wants to trade.
      </Text>

      <View
        accessibilityRole="tablist"
        style={{
          marginTop: 22,
          height: 50,
          borderRadius: 25,
          borderWidth: 1.6,
          borderColor: M.line,
          backgroundColor: M.track,
          flexDirection: 'row',
          padding: 4,
        }}
      >
        {options.map((o) => {
          const selected = o.value === tab;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => {
                if (!selected) haptic.selection();
                onTab(o.value);
              }}
              style={{
                flex: 1,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? M.red : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: selected ? INTER_BOLD : INTER_SEMI,
                  fontSize: 15,
                  color: selected ? '#FFFFFF' : '#2B2B2B',
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------- filter chips ------------------------------ */

export function FilterChips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string; count: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const M = useM();

  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: GUTTER, marginTop: 14 }}>
      {items.map((it) => {
        const selected = it.value === value;
        return (
          <Press
            key={it.value}
            haptic="selection"
            scale="sm"
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${it.label}, ${it.count}`}
            onPress={() => onChange(it.value)}
            style={{
              height: 33,
              borderRadius: 17,
              paddingLeft: 10,
              paddingRight: 5,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: selected ? M.red : 'transparent',
              borderWidth: 1.4,
              borderColor: selected ? M.red : M.ink,
            }}
          >
            <Text
              style={{
                fontFamily: selected ? INTER_BOLD : INTER_SEMI,
                fontSize: 13,
                color: selected ? '#FFFFFF' : M.ink,
              }}
            >
              {it.label}
            </Text>
            <View
              style={{
                minWidth: 21,
                height: 21,
                borderRadius: 11,
                paddingHorizontal: 4,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? '#FFFFFF' : 'transparent',
                borderWidth: selected ? 0 : 1.2,
                borderColor: M.line,
              }}
            >
              <Text
                style={{
                  fontFamily: INTER_BOLD,
                  fontSize: 12,
                  color: selected ? M.red : M.ink,
                }}
              >
                {it.count}
              </Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/* ------------------------------ illustrations ------------------------------ */

/** A product photo in a slightly rotated, white-bordered, rounded card. */
function PhotoCard({
  source,
  width,
  height,
  rotate,
  style,
}: {
  source: number;
  width: number;
  height: number;
  rotate: number;
  style: object;
}) {
  const M = useM();

  return (
    <View
      style={[
        {
          position: 'absolute',
          width,
          height,
          padding: 4,
          borderRadius: 22,
          backgroundColor: M.surface,
          transform: [{ rotate: `${rotate}deg` }],
          shadowColor: '#000',
          shadowOpacity: 0.14,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 7 },
          elevation: 6,
        },
        style,
      ]}
    >
      <Image
        source={source}
        resizeMode="cover"
        style={{ width: '100%', height: '100%', borderRadius: 18 }}
      />
    </View>
  );
}

function Badge({ icon, style }: { icon: 'sparkles' | 'paper-plane'; style: object }) {
  const M = useM();

  return (
    <View
      style={[
        {
          position: 'absolute',
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: M.red,
          borderWidth: 3.5,
          borderColor: M.surface,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={27} color="#FFFFFF" />
    </View>
  );
}

const ART_W = 340;

/** Mirrors: camera + laptop, joined by the sparkle badge. */
export function MirrorsArt() {
  return (
    <View style={{ width: ART_W, height: 252 }}>
      <View style={{ position: 'absolute', left: 36, top: 10 }}>
        <PinkBlob width={268} height={236} />
      </View>
      <PhotoCard
        source={photo.camera}
        width={152}
        height={146}
        rotate={-8}
        style={{ left: 22, top: 42 }}
      />
      <PhotoCard
        source={photo.laptop}
        width={128}
        height={146}
        rotate={7}
        style={{ left: 190, top: 62 }}
      />
      <Badge icon="sparkles" style={{ left: 142, top: 140 }} />
      <View style={{ position: 'absolute', left: 8, top: 178 }}>
        <Scribble width={104} />
      </View>
      <View style={{ position: 'absolute', right: 26, top: 6 }}>
        <AccentLines size={50} />
      </View>
    </View>
  );
}

/** Sent: chair + headphones, joined by the send badge. */
export function SentArt() {
  return (
    <View style={{ width: ART_W, height: 252 }}>
      <View style={{ position: 'absolute', left: 36, top: 10 }}>
        <PinkBlob width={268} height={236} />
      </View>
      <PhotoCard
        source={photo.chair}
        width={140}
        height={150}
        rotate={-6}
        style={{ left: 30, top: 38 }}
      />
      <PhotoCard
        source={photo.headphones}
        width={138}
        height={142}
        rotate={6}
        style={{ left: 186, top: 58 }}
      />
      <Badge icon="paper-plane" style={{ left: 141, top: 132 }} />
      <View style={{ position: 'absolute', left: 6, top: 176 }}>
        <Scribble width={104} />
      </View>
      <View style={{ position: 'absolute', right: 20, top: 4 }}>
        <AccentLines size={50} />
      </View>
    </View>
  );
}

/** Received: concrete form, raised white tile with the send arrow. */
export function ReceivedArt() {
  const M = useM();

  return (
    <View style={{ width: ART_W, height: 252 }}>
      <View style={{ position: 'absolute', left: 40, top: 8 }}>
        <PinkBlob width={262} height={232} />
      </View>
      <Image
        source={photo.concrete}
        resizeMode="contain"
        style={{ position: 'absolute', left: 36, top: 104, width: 150, height: 134 }}
      />
      <View
        style={{
          position: 'absolute',
          left: 108,
          top: 42,
          width: 128,
          height: 124,
          borderRadius: 26,
          backgroundColor: M.surface,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-4deg' }],
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        }}
      >
        <Ionicons name="navigate" size={62} color={M.ink} />
      </View>
      <View style={{ position: 'absolute', right: 40, top: 10 }}>
        <AccentLines size={50} />
      </View>
    </View>
  );
}

/* ---------------------------- empty-state chrome --------------------------- */

export function EmptyShell({
  art,
  title,
  body,
  large = false,
  children,
}: {
  art: ReactNode;
  title: string;
  /** The big two-line heading (Mirrors); the others use the smaller single line. */
  large?: boolean;
  /** One entry per line, so the wrapping matches the reference exactly. */
  body: string[];
  children?: ReactNode;
}) {
  const M = useM();

  return (
    <View style={{ alignItems: 'center', paddingTop: 6, paddingHorizontal: GUTTER }}>
      {art}
      <Text
        style={{
          fontFamily: TITLE,
          fontSize: large ? 52 : 36,
          lineHeight: large ? 46 : 40,
          letterSpacing: large ? -2.9 : -1.9,
          color: M.ink,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: INTER,
          fontSize: 13,
          lineHeight: 19.5,
          color: M.secondary,
          textAlign: 'center',
          marginTop: 14,
        }}
      >
        {body.join(String.fromCharCode(10))}
      </Text>
      {children}
    </View>
  );
}

export function PrimaryCta({ label, onPress }: { label: string; onPress: () => void }) {
  const M = useM();

  return (
    <Press
      haptic="light"
      scale="sm"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      states={{ pressed: { backgroundColor: M.redPressed } }}
      style={{
        marginTop: 24,
        height: 44,
        borderRadius: 9,
        paddingLeft: 22,
        paddingRight: 18,
        minWidth: 236,
        backgroundColor: M.red,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        shadowColor: M.red,
        shadowOpacity: 0.22,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 4,
      }}
    >
      <Text style={{ fontFamily: INTER_SEMI, fontSize: 15.5, color: '#FFFFFF' }}>{label}</Text>
      <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
    </Press>
  );
}

export function SecondaryLink({ label, onPress }: { label: string; onPress: () => void }) {
  const M = useM();

  return (
    <Press
      haptic="light"
      scale="md"
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={{
        marginTop: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 3,
        borderBottomWidth: 1.6,
        borderBottomColor: M.ink,
      }}
    >
      <Text style={{ fontFamily: INTER_SEMI, fontSize: 14.5, color: M.ink }}>{label}</Text>
      <Ionicons name="arrow-forward" size={18} color={M.ink} />
    </Press>
  );
}
