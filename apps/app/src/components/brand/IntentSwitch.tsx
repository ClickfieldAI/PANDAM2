import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';

import { Press, Text } from '@pandam/ui';

import { homeImages } from '@/lib/homeAssets';

const ORANGE = '#FF3B20';
const INK = '#111111';
const CARD_BORDER = '#E9E6DF';

/** Fixed and TALLER than each card's own width — a narrow vertical tile,
 *  not a wide horizontal one. Independent of image size. */
const PANEL_H = 214;
/** One even corner radius for both cards, applied to a real clipping frame. */
const RADIUS = 28;

type Side = 'have' | 'need';

const COPY: Record<Side, { number: string; tag: string; lines: string[] }> = {
  have: { number: '01', tag: 'I HAVE', lines: ['What I', 'can', 'offer'] },
  need: { number: '02', tag: 'I NEED', lines: ["What I'm", 'looking', 'for'] },
};

/**
 * I HAVE / I NEED — two matched hero cards: same width, same fixed height,
 * same evenly rounded frame. Each frame clips its contents — the product
 * image sits flush in the lower-right corner, so it never pokes past a corner,
 * affects the card's dimensions or covers the typography.
 */
export function IntentSwitch({
  haveCount,
  needCount,
  onHave,
  onNeed,
}: {
  haveCount: number;
  needCount: number;
  onHave: () => void;
  onNeed: () => void;
}) {
  const panel = (side: Side, count: number, onPress: () => void) => {
    const c = COPY[side];
    const isHave = side === 'have';
    const fg = isHave ? INK : '#FFFFFF';

    return (
      <Press
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`${c.tag}: ${c.lines.join(' ')}. ${count} active.`}
        onPress={onPress}
        style={{ flex: 1, height: PANEL_H }}
      >
        {/* The frame: one evenly rounded rectangle that CLIPS everything inside
            it, so the product image can never poke past a corner. */}
        <View
          style={{
            flex: 1,
            borderRadius: RADIUS,
            overflow: 'hidden',
            backgroundColor: isHave ? '#E9E6DF' : ORANGE,
            borderWidth: isHave ? 1 : 0,
            borderColor: CARD_BORDER,
          }}
        >
          {/* The photo IS the card background, full bleed. */}
          <Image
            source={isHave ? homeImages.intentHave : homeImages.intentNeed}
            resizeMode="cover"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
            }}
          />

          <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
            <View style={{ maxWidth: '62%' }}>
              <Text
                style={{
                  fontFamily: 'InterTight_900Black',
                  fontSize: 46,
                  lineHeight: 54,
                  letterSpacing: -1.5,
                  color: fg,
                }}
              >
                {c.number}
              </Text>
              <Text
                style={{
                  fontFamily: 'InterTight_700Bold',
                  fontSize: 12,
                  letterSpacing: 0.6,
                  color: fg,
                  marginTop: 2,
                }}
              >
                {c.tag}
              </Text>
              <View style={{ marginTop: 6 }}>
                {c.lines.map((line) => (
                  <Text
                    key={line}
                    style={{
                      fontFamily: 'InterTight_900Black',
                      fontSize: 21,
                      lineHeight: 21,
                      letterSpacing: -0.4,
                      color: fg,
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>

            {/* bare arrow — a visual cue, not a button */}
            <Ionicons name="arrow-forward" size={18} color={fg} />
          </View>
        </View>
      </Press>
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {panel('have', haveCount, onHave)}
      {panel('need', needCount, onNeed)}
    </View>
  );
}
