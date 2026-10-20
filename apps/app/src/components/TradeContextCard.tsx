import { Ionicons } from '@expo/vector-icons';
import { type OfferStatus, type OfferView } from '@pandam/types';
import { Image, Text, View } from 'react-native';

import { Press, Reveal } from '@pandam/ui';

import { useM } from '@/components/matches/MatchesUI';
import { mediaSrc } from '@/lib/api/media';
import { type ThemeColors, useThemeColors } from '@pandam/ui';

/** Status vocabulary shared with the offer screen (see `StatusPill`). */
export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
  expired: 'Expired',
  countered: 'Countered',
};

const makePill = (
  colors: ThemeColors,
): Record<OfferStatus, { bg: string; fg: string; dot: string }> => ({
  pending: { bg: colors.warningSoft, fg: colors.warningText, dot: colors.warning },
  accepted: { bg: colors.successSoft, fg: colors.successText, dot: colors.success },
  rejected: { bg: colors.dangerSoft, fg: colors.dangerText, dot: colors.danger },
  cancelled: { bg: colors.surfaceMuted, fg: colors.textSecondary, dot: colors.textMuted },
  expired: { bg: colors.surfaceMuted, fg: colors.textSecondary, dot: colors.textMuted },
  countered: { bg: colors.infoSoft, fg: colors.infoText, dot: colors.info },
});

/** The small rounded status badge with a dot (Accepted = green, as in the reference). */
export function StatusPill({ status, label }: { status: OfferStatus; label?: string }) {
  const colors = useThemeColors();
  const c = makePill(colors)[status];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 14,
        backgroundColor: c.bg,
        paddingHorizontal: 10,
        height: 26,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
      <Text style={{ fontFamily: 'InterTight_600SemiBold', fontSize: 13, color: c.fg }}>
        {label ?? OFFER_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

/** One line under the chat header that says where the trade stands. */
export function tradeSubtitle(offer: OfferView | undefined): string {
  if (!offer) return 'Trade chat';
  switch (offer.status) {
    case 'pending':
      return offer.isMine ? 'Offer sent — waiting for a reply' : 'Sent you a trade offer';
    case 'accepted':
      return 'Trade agreed — arrange the swap';
    case 'rejected':
      return 'Offer declined';
    case 'cancelled':
      return 'Offer withdrawn';
    default:
      return 'Offer expired';
  }
}

/**
 * The real photo for this trade: the requested item's own cover photo, falling
 * back to a photo attached to the offer. Renders nothing when neither exists —
 * never a stand-in product photo.
 */
function TradeThumb({ offer }: { offer: OfferView }) {
  const colors = useThemeColors();

  const src = mediaSrc(offer.requested.imageUrl ?? offer.imageUrl ?? undefined);
  if (!src) return null;
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borderSoft,
        overflow: 'hidden',
      }}
    >
      <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

/**
 * The compact "why are we talking" block pinned under a trade chat's header:
 * what is being swapped for what, the offer's live status, and a way to the
 * full offer. Bordered card with a pale-pink swap tile, per the Pandam design.
 */
export function TradeContextCard({ offer, onOpen }: { offer: OfferView; onOpen: () => void }) {
  const M = useM();

  const colors = useThemeColors();

  const label = offer.requestedKind === 'need' ? 'OFFER FOR A REQUEST' : 'TRADE OFFER';

  return (
    <Reveal>
      <Press
        scale="sm"
        accessibilityRole="button"
        accessibilityLabel={`Trade offer: ${offer.offered.title} for ${offer.requested.title}. ${OFFER_STATUS_LABEL[offer.status]}. View offer.`}
        onPress={onOpen}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1.4,
          borderColor: M.line,
          backgroundColor: colors.surface,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            backgroundColor: M.pink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="swap-horizontal" size={24} color={M.red} />
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text
              style={{
                fontFamily: 'InterTight_600SemiBold',
                fontSize: 12,
                letterSpacing: 0.6,
                color: colors.textSecondary,
              }}
            >
              {label}
            </Text>
            <StatusPill status={offer.status} />
          </View>
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'InterTight_700Bold', fontSize: 18, color: M.ink }}
          >
            {offer.requested.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: 'InterTight_400Regular', fontSize: 14, color: colors.textMuted }}
          >
            {offer.isMine ? 'You offer' : 'They offer'}: {offer.offered.title}
          </Text>
        </View>

        <TradeThumb offer={offer} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: 'InterTight_700Bold', fontSize: 15, color: M.red }}>View</Text>
          <Ionicons name="chevron-forward" size={16} color={M.red} />
        </View>
      </Press>
    </Reveal>
  );
}
