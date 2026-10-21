/**
 * Call, WhatsApp and Maps buttons: open the right app for a number or a place, and say plainly
 * when that is not possible instead of failing silently.
 *
 *  - Call: a `tel:` link. The phone's own dialer opens with the number filled in; the person
 *    still has to press call. No VoIP.
 *  - WhatsApp: the official `wa.me` link (also WhatsApp Business), with no pre-filled text, so
 *    nothing is sent until the person writes and sends it themselves. The `whatsapp://` scheme is
 *    tried first on a phone (straight into the app); if WhatsApp is not installed, the `wa.me`
 *    page opens in the browser, which offers to install it or to continue on WhatsApp Web.
 */
import { telUrl, whatsappAppUrl, whatsappUrl } from '@pandam/validation';
import { Linking, Platform } from 'react-native';

import { type MapPlatform, type MapPoint, mapLinks } from './maps';

export type OpenResult = { ok: true } | { ok: false; message: string };

async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Open the phone's dialer with `phone` (E.164) filled in. */
export async function openDialer(phone: string | null | undefined): Promise<OpenResult> {
  const url = phone ? telUrl(phone) : null;
  if (!url) return { ok: false, message: 'There is no valid phone number to call.' };
  if (await tryOpen(url)) return { ok: true };
  return {
    ok: false,
    message: 'This device cannot place phone calls. You can still send a message in the app.',
  };
}

/** Open a WhatsApp chat with `phone` (E.164), without sending anything. */
export async function openWhatsApp(phone: string | null | undefined): Promise<OpenResult> {
  const web = phone ? whatsappUrl(phone) : null;
  if (!web || !phone) return { ok: false, message: 'There is no valid WhatsApp number.' };

  if (Platform.OS !== 'web') {
    const app = whatsappAppUrl(phone);
    // Straight into the app when it is installed (Android and iOS both resolve this scheme).
    if (app && (await tryOpen(app))) return { ok: true };
  }
  // Not installed (or on the web): the official link, which falls back to the browser page.
  if (await tryOpen(web)) return { ok: true };
  return {
    ok: false,
    message: 'Could not open WhatsApp. Check that it is installed, or try again from a browser.',
  };
}

const platform = (): MapPlatform =>
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'other';

/** Open a shared place in the person's maps app (or the browser as a last resort). */
export async function openLocation(point: MapPoint): Promise<OpenResult> {
  for (const url of mapLinks(point, platform())) {
    if (await tryOpen(url)) return { ok: true };
  }
  return { ok: false, message: 'Could not open a maps app for this location.' };
}
